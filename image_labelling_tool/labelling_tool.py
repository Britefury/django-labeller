# The MIT License (MIT)
#
# Copyright (c) 2015 University of East Anglia, Norwich, UK
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.
#
# Developed by Geoffrey French in collaboration with Dr. M. Fisher and
# Dr. M. Mackiewicz.
import json
from abc import abstractmethod
import io
import math
import itertools
import pathlib
import re
from typing import Any, Optional, Union, Container, Sequence, Tuple, List, Generator
from typing import Mapping, MutableMapping, Dict, Callable, IO
import copy
from deprecated import deprecated

import numpy as np

import uuid

from PIL import Image, ImageDraw

from skimage.color import gray2rgb
from skimage.measure import find_contours

# Try to import cv2
try:
    import cv2
except:
    cv2 = None


# Configuration is composed of nested dictionaries. It's structure is given below.
# If values or sections are not present, then the defaults specified below will be used.
#
# config: {
#     tools: {
#         imageSelector: bool [default=True] if True, show the UI that allows the user to switch between images
#         labelClassSelector: bool [default=True] if True, show the label class selection UI and allow the user to
#                 assign classes to labels
#         labelClassFilter: <bool> [default=False] if True, allow the user to choose to view only labels belonging to
#                 a specific class
#         labelClassFilterInitial: <string|False|None> [default=None] the initial label class filter; at startup
#                 only labels of this class will be visible. If given a value of None, only labels that
#                 have no assigned class will be shown. If given a value of False, all labels will be shown.
#         brushSelect: <bool> [default=True] if True, enable the brush select tool
#         drawPointLabel: <bool> [default=True] if True, enable the create/draw point label tool
#         drawBoxLabel: <bool> [default=True] if True, enable the create/draw box label tool
#         drawOrientedEllipseLabel: <bool> [default=True] if True, enable the create/drawn oriented ellipse label tool
#         drawPolyLabel: <bool> [default=True] if True, enable the create/drawn polygonal label tool
#         groupLabel: <bool> [default=True] if True, enable the create group label tool
#         deleteLabel: <bool> [default=True] if True, enable the delete label tool
#         legacy: {
#             compositeLabel: <bool> [default=True] if True, enable the LEGACY create composite label tool
#         }
#         deleteConfig: {
#             typePermissions: {
#                 point: <bool> [default=True] if True, allow the user to delete point labels
#                 box: <bool> [default=True] if True, allow the user to delete box labels
#                 oriented_ellipse: <bool> [default=True] if True, allow the user to delete oriented ellipse labels
#                 polygon: <bool> [default=True] if True, allow the user to delete polygonal labels
#                 composite: <bool> [default=True] if True, allow the user to delete LEGACY composite labels
#                 group: <bool> [default=True] if True, allow the user to delete group labels (deleting a group
#                         label will ungroup the child labels, leaving them in place
#             }
#         }
#         nextUnlockedConfig: {
#             numImagesLimit: <int> [default=100] when using locking in a multi-user app (e.g. in a Django app),
#                     this is the maximum number of images that will be searched for the next available unlocked image
#         }
#     }
#     settings: {
#         inactivityTimeoutMS: <int> [default=10000] the period of inactivity after which the tool will stop
#                 accumulating time in the images' timeElapsed metadata that measures the amount of time users have
#                 spend annotating an current image
#         brushWheelRate: <float> [default=0.025] the scale factor that affects the rate at which the mouse
#                 wheel changes the brush size (measured in image pixels) when using the brush select tool
#         brushKeyRate: <float> [default=2.0] the amount by which keyboard shortcuts modify (up or down) the
#                 brush size (measured in image pixels) when using the brush select tool
#         fullscreenButton: <bool> [default=True] if True, enable the full screen button
#     }
# }
DEFAULT_CONFIG = {
    'tools': {
        'imageSelector': True,
        'labelClassSelector': True,
        'drawPointLabel': False,
        'drawBoxLabel': True,
        'drawOrientedEllipseLabel': True,
        'drawPolyLabel': True,
        'deleteLabel': True,
        'deleteConfig': {
            'typePermissions': {
                'point': True,
                'box': True,
                'polygon': True,
                'composite': True,
                'group': True,
            }
        },
        'legacy': {
            'compositeLabel': False
        }
    },
    'settings': {
        'brushWheelRate': 0.025,  # Change rate for brush radius (mouse wheel)
        'brushKeyRate': 2.0,  # Change rate for brush radius (keyboard)
        'fullscreenButton': False,
    }
}


class AbstractLabelClass (object):
    @abstractmethod
    def to_json(self) -> Any:
        pass


ColourTriple = Union[Tuple[int, int, int], List[int]]

class LabelClass (AbstractLabelClass):
    def __init__(self, name: str, human_name: str, colour: Optional[ColourTriple] = None,
                 colours: Optional[Mapping[str, ColourTriple]] = None):
        """
        Label class constructor
        
        :param name: identifier class name 
        :param human_name: human readable name
        :param colour: colour as a tuple or list e.g. [255, 0, 0] for red
        :param colours: colours as a dict that maps colour scheme name to colour as a tuple or list
        """
        self.name = name
        self.human_name = human_name
        if colour is not None:
            if colours is not None:
                raise TypeError('only one of colour or colours should be provided, not both')
            if isinstance(colour, (tuple, list)):
                colour = list(colour)
                if len(colour) != 3:
                    raise TypeError('colour must be a tuple or list of length 3')
                colours = {'default': colour}
            elif isinstance(colour, dict):
                colours = colour
            else:
                raise TypeError('colour should be a tuple, a list or a dict')

        if colours is not None:
            if isinstance(colours, dict):
                colours = {k: list(v) for k, v in colours.items()}
                for v in colours.values():
                    if len(v) != 3:
                        raise TypeError('values in colours must be tuples or lists of length 3')

        self.colours = colours

    def to_json(self) -> Any:
        return {'name': self.name, 'human_name': self.human_name, 'colours': self.colours}


class LabelClassGroup (AbstractLabelClass):
    def __init__(self, human_name: str, classes: List[LabelClass]):
        """
        Label class group constructor

        :param human_name: human readable name
        :param classes: member classes
        """
        self.group_name = human_name
        self.classes = classes

    def to_json(self) -> Any:
        return {'group_name': self.group_name, 'group_classes': [cls.to_json() for cls in self.classes]}


def label_class(name: str, human_name: str, rgb: Tuple[int, int, int]) -> Any:
    return {'name': name,
            'human_name': human_name,
            'colour': rgb}

def label_class_group(human_name: str, classes_json: List[Any]) -> Any:
    return {'group_name': human_name,
            'group_classes': classes_json}

def image_descriptor(image_id: Any, url: Optional[Any] = None,
                     width: Optional[int] = None, height: Optional[int] = None):
    return {'image_id': str(image_id),
            'img_url': str(url) if url is not None else None,
            'width': width,
            'height': height,}


class _AnnoControl (object):
    __control_type__ = None

    def __init__(self, identifier: str):
        self.identifier = identifier

    def to_json(self) -> Any:
        return dict(control=self.__control_type__, identifier=self.identifier)


class _AnnoControlVis (_AnnoControl):
    __control_type__ = None

    def __init__(self, identifier: str, visibility_label_text: Optional[str] = None):
        super(_AnnoControlVis, self).__init__(identifier)
        self.visibility_label_text = visibility_label_text

    def to_json(self) -> Any:
        js = super(_AnnoControlVis, self).to_json()
        js['visibility_label_text'] = self.visibility_label_text
        return js


class AnnoControlCheckbox (_AnnoControlVis):
    __control_type__ = 'checkbox'

    def __init__(self, identifier: str, label_text: str, visibility_label_text: Optional[str] = None):
        super(AnnoControlCheckbox, self).__init__(identifier, visibility_label_text=visibility_label_text)
        self.label_text = label_text

    def to_json(self) -> Any:
        js = super(AnnoControlCheckbox, self).to_json()
        js['label_text'] = self.label_text
        return js


class AnnoControlRadioButtons (_AnnoControlVis):
    __control_type__ = 'radio'

    def __init__(self, identifier: str, label_text: str, choices: List[Dict[str, Any]],
                 label_on_own_line: bool = False, visibility_label_text: Optional[str] = None):
        super(AnnoControlRadioButtons, self).__init__(identifier, visibility_label_text=visibility_label_text)
        self.label_text = label_text
        self.choices = choices
        self.label_on_own_line = label_on_own_line

    def to_json(self) -> Any:
        js = super(AnnoControlRadioButtons, self).to_json()
        js['label_text'] = self.label_text
        js['choices'] = self.choices
        js['label_on_own_line'] = self.label_on_own_line
        return js

    @classmethod
    def choice(cls, value, label_text, tooltip) -> Dict[str, Any]:
        return dict(value=value, label_text=label_text, tooltip=tooltip)


class AnnoControlPopupMenu (_AnnoControlVis):
    __control_type__ = 'popup_menu'

    def __init__(self, identifier: str, label_text: str, groups: List[Dict[str, Any]], visibility_label_text=None):
        super(AnnoControlPopupMenu, self).__init__(identifier, visibility_label_text=visibility_label_text)
        self.label_text = label_text
        self.groups = groups

    def to_json(self) -> Any:
        js = super(AnnoControlPopupMenu, self).to_json()
        js['label_text'] = self.label_text
        js['groups'] = self.groups
        return js

    @classmethod
    def group(cls, label_text, choices) -> Dict[str, Any]:
        return dict(label_text=label_text, choices=choices)

    @classmethod
    def choice(cls, value, label_text, tooltip) -> Dict[str, Any]:
        return dict(value=value, label_text=label_text, tooltip=tooltip)


class AnnoControlText (_AnnoControl):
    __control_type__ = 'text'

    def __init__(self, identifier: str, label_text: str, multiline: bool = False):
        super(AnnoControlText, self).__init__(identifier)
        self.label_text = label_text
        self.multiline = multiline

    def to_json(self) -> Any:
        js = super(AnnoControlText, self).to_json()
        js['label_text'] = self.label_text
        js['multiline'] = self.multiline
        return js


def _next_wrapped_array(xs: np.ndarray) -> np.ndarray:
    return np.append(xs[1:], xs[:1], axis=0)


def _prev_wrapped_array(xs: np.ndarray) -> np.ndarray:
    return np.append(xs[-1:], xs[:-1], axis=0)


def _simplify_contour(cs: np.ndarray) -> Optional[np.ndarray]:
    degenerate_verts = (cs == _next_wrapped_array(cs)).all(axis=1)
    while degenerate_verts.any():
        cs = cs[~degenerate_verts,:]
        degenerate_verts = (cs == _next_wrapped_array(cs)).all(axis=1)

    if cs.shape[0] > 0:
        # Degenerate edges
        edges = (_next_wrapped_array(cs) - cs)
        edges = edges / np.sqrt((edges**2).sum(axis=1))[:,None]
        degenerate_edges = (_prev_wrapped_array(edges) * edges).sum(axis=1) > (1.0 - 1.0e-6)
        cs = cs[~degenerate_edges,:]

        if cs.shape[0] > 0:
            return cs
    return None


_LABEL_CLASS_REGISTRY = {}


class ObjectTable:
    def __init__(self, id_prefix: Optional[str], objects: Optional[Sequence[Any]] = None):
        if id_prefix is None or id_prefix == '':
            id_prefix = str(uuid.uuid4())
        self._id_prefix = id_prefix
        self._object_id_to_obj = {}
        self._old_object_id_to_obj = {}
        self._next_object_idx = 1

        if objects is not None:
            # Register objects with object IDs
            for obj in objects:
                self.register(obj)

    def register(self, obj: Any) -> str:
        obj_id = obj.object_id

        if obj_id is None:
            obj_id = '{}__{}'.format(self._id_prefix, self._next_object_idx)
            self._next_object_idx += 1
            obj.object_id = obj_id
        elif isinstance(obj_id, int):
            self._next_object_idx = max(self._next_object_idx, obj_id + 1)
            obj_id = '{}__{}'.format(self._id_prefix, obj_id)
            obj.object_id = obj_id

        if obj_id in self._object_id_to_obj:
            if self._object_id_to_obj[obj_id] is not obj:
                raise ValueError('Duplicate object ID {}'.format(obj_id))
        else:
            self._object_id_to_obj[obj_id] = obj

        return obj_id

    def __getitem__(self, obj_id: Optional[str]) -> Optional[Any]:
        if obj_id is None:
            return None
        else:
            return self._object_id_to_obj[obj_id]

    def get(self, obj_id: Optional[str], default: Optional[Any] = None) -> Optional[Any]:
        if obj_id is None:
            return None
        else:
            return self._object_id_to_obj.get(obj_id, default)

    def _new_style_id(self, obj_id: Optional[Union[str, int]]) -> Optional[str]:
        """
        Convert object ID to new '<prefix_uuid>__<index>' style.
        Object IDs used to be integers; if `obj_id` is an int, then convert it to the new style.

        :param obj_id: [optional] object ID as either str (new style) or int (old style)
        :return: new style object ID as str or None if `obj_id` is None
        """
        if obj_id is None:
            return None
        elif isinstance(obj_id, int):
            return '{}__{}'.format(self._id_prefix, obj_id)
        else:
            return obj_id

    def __contains__(self, obj_id: Optional[str]) -> bool:
        return obj_id in self._object_id_to_obj


class LabelContext:
    def __init__(self, point_radius: float = 0.0):
        self.point_radius = point_radius


def label_cls(cls: Any) -> Any:
    """Label class decorator

    Registers a label class

    Exmaple:
    >>> @label_cls
    ... class SomeLabel (AbstractLabel):
    ...     __json_type_name__ = 'some'
    """
    json_label_type = cls.__json_type_name__
    _LABEL_CLASS_REGISTRY[json_label_type] = cls
    return cls


class AbstractLabel (object):
    __json_type_name__ = None

    def __init__(self, object_id: Optional[str] = None, classification: Optional[str] = None,
                 source: Optional[str] = None, anno_data: Optional[Dict[str, Any]] = None):
        """
        Constructor

        :param object_id: a unique integer object ID or None
        :param classification: a str giving the label's ground truth classification
        :param source: [optional] a str stating how the label was created
            (e.g. 'manual', 'auto:dextr', 'auto:maskrcnn', etc)
        :param anno_data: [optional] a dict mapping field names to values
        """
        self.object_id = object_id
        self.classification = classification
        self.source = source
        if anno_data is None:
            anno_data = {}
        self.anno_data = anno_data

    @property
    def dependencies(self) -> Sequence['AbstractLabel']:
        return []

    def flatten(self) -> Generator['AbstractLabel', None, None]:
        yield self

    def fill_label_class_histogram(self, histogram: MutableMapping[str, int]):
        histogram[self.classification] = histogram.get(self.classification, 0) + 1

    @abstractmethod
    def bounding_box(self, ctx: Optional[LabelContext] = None) -> Tuple[Optional[np.ndarray], Optional[np.ndarray]]:
        pass

    @abstractmethod
    def _warp(self, xform_fn: Callable[[np.ndarray], np.ndarray], object_table: ObjectTable) -> 'AbstractLabel':
        pass

    def warped(self, xform_fn: Callable[[np.ndarray], np.ndarray], object_table: Optional[ObjectTable] = None,
               id_prefix: Optional[str] = None):
        if object_table is None:
            object_table = ObjectTable(id_prefix)
        w = self._warp(xform_fn, object_table)
        object_table.register(w)
        return w

    @abstractmethod
    def _render_mask(self, img: Image, fill: bool, dx: float=0.0, dy: float=0.0,
                     ctx: Optional[LabelContext] = None):
        pass

    def render_mask(self, width: int, height: int, fill: bool, dx: float = 0.0, dy: float = 0.0,
                    ctx: Optional[LabelContext] = None):
        img = Image.new('L', (width, height), 0)
        self._render_mask(img, fill, dx, dy, ctx)
        return np.array(img)

    def to_json(self) -> Any:
        return dict(label_type=self.__json_type_name__,
                    object_id=self.object_id,
                    label_class=self.classification,
                    source=self.source,
                    anno_data=self.anno_data)

    @classmethod
    @abstractmethod
    def new_instance_from_json(cls, label_json: Any, object_table: ObjectTable) -> 'AbstractLabel':
        pass

    @staticmethod
    def from_json(label_json: Any, object_table: ObjectTable) -> 'AbstractLabel':
        label_type = label_json['label_type']
        cls = _LABEL_CLASS_REGISTRY.get(label_type)
        if cls is None:
            raise TypeError('Unknown label type {0}'.format(label_type))
        label = cls.new_instance_from_json(label_json, object_table)
        object_table.register(label)
        return label


@label_cls
class PointLabel (AbstractLabel):
    __json_type_name__ = 'point'

    def __init__(self, position_xy: np.ndarray, object_id: Optional[str] = None, classification: Optional[str] = None,
                 source: Optional[str] = None, anno_data: Optional[Dict[str, Any]] = None):
        """
        Constructor

        :param position_xy: position of point as a (2,) NumPy array providing the x and y co-ordinates
        :param object_id: a unique integer object ID or None
        :param classification: a str giving the label's ground truth classification
        :param source: [optional] a str stating how the label was created
            (e.g. 'manual', 'auto:dextr', 'auto:maskrcnn', etc)
        :param anno_data: [optional] a dict mapping field names to values
        """
        super(PointLabel, self).__init__(object_id, classification, source, anno_data)
        self.position_xy = np.array(position_xy).astype(float)

    def bounding_box(self, ctx: Optional[LabelContext] = None) -> Tuple[Optional[np.ndarray], Optional[np.ndarray]]:
        point_radius = ctx.point_radius if ctx is not None else 0.0
        return self.position_xy - point_radius, self.position_xy + point_radius

    def _warp(self, xform_fn: Callable[[np.ndarray], np.ndarray], object_table: ObjectTable) -> AbstractLabel:
        warped_pos = xform_fn(self.position_xy[None, :])
        return PointLabel(warped_pos[0, :], self.object_id, self.classification, self.source, self.anno_data)

    def _render_mask(self, img: Image, fill: bool, dx: float=0.0, dy: float=0.0,
                     ctx: Optional[LabelContext] = None):
        point_radius = ctx.point_radius if ctx is not None else 0.0

        x = self.position_xy[0] + dx
        y = self.position_xy[1] + dy

        if point_radius == 0.0:
            ImageDraw.Draw(img).point((x, y), fill=1)
        else:
            ellipse = [(x-point_radius, y-point_radius),
                       (x+point_radius, y+point_radius)]
            if fill:
                ImageDraw.Draw(img).ellipse(ellipse, outline=1, fill=1)
            else:
                ImageDraw.Draw(img).ellipse(ellipse, outline=1, fill=0)

    def to_json(self) -> Any:
        js = super(PointLabel, self).to_json()
        js['position'] = dict(x=self.position_xy[0], y=self.position_xy[1])
        return js

    def __str__(self) -> str:
        return 'PointLabel(object_id={}, classification={}, position_xy={})'.format(
            self.object_id, self.classification, self.position_xy.tolist()
        )

    @classmethod
    def new_instance_from_json(cls, label_json: Any, object_table: ObjectTable) -> AbstractLabel:
        pos_xy = np.array([label_json['position']['x'], label_json['position']['y']])
        return PointLabel(pos_xy, label_json.get('object_id'),
                          classification=label_json['label_class'],
                          source=label_json.get('source'),
                          anno_data=label_json.get('anno_data'))


@label_cls
class PolygonLabel (AbstractLabel):
    __json_type_name__ = 'polygon'

    def __init__(self, regions, object_id=None, classification=None, source=None, anno_data=None):
        """
        Constructor

        :param regions: list of regions where each region is an array of vertices as a (N,2) NumPy array providing the [x, y] co-ordinates
        :param object_id: a unique integer object ID or None
        :param classification: a str giving the label's ground truth classification
        :param source: [optional] a str stating how the label was created
            (e.g. 'manual', 'auto:dextr', 'auto:maskrcnn', etc)
        :param anno_data: [optional] a dict mapping field names to values
        """
        super(PolygonLabel, self).__init__(object_id, classification, source, anno_data)
        regions = [np.array(region).astype(float) for region in regions]
        self.regions = regions

    def bounding_box(self, ctx: Optional[LabelContext] = None) -> Tuple[Optional[np.ndarray], Optional[np.ndarray]]:
        all_verts = np.concatenate(self.regions, axis=0)
        return all_verts.min(axis=0), all_verts.max(axis=0)

    def _warp(self, xform_fn: Callable[[np.ndarray], np.ndarray], object_table: ObjectTable) -> AbstractLabel:
        warped_regions = [xform_fn(region) for region in self.regions]
        return PolygonLabel(warped_regions, self.object_id, self.classification, self.source, self.anno_data)

    def _render_mask(self, img: Image, fill: bool, dx: float=0.0, dy: float=0.0,
                     ctx: Optional[LabelContext] = None):
        # Rendering helper function: create a binary mask for a given label

        # Polygonal label
        if fill:
            # Filled
            if len(self.regions) == 1:
                # Simplest case: 1 region
                region = self.regions[0]
                if len(region) >= 3:
                    vertices = region + np.array([[dx, dy]])
                    polygon = [tuple(v) for v in vertices]

                    ImageDraw.Draw(img).polygon(polygon, outline=1, fill=1)
            else:
                # Need to combine regions
                mask = np.zeros(img.size[::-1], dtype=bool)
                for region in self.regions:
                    if len(region) >= 3:
                        vertices = region + np.array([[dx, dy]])
                        polygon = [tuple(v) for v in vertices]

                        region_img = Image.new('L', img.size, 0)
                        ImageDraw.Draw(region_img).polygon(polygon, outline=1, fill=1)
                        region_img = np.array(region_img) > 0
                        mask = mask ^ region_img
                img_arr = np.array(img) | mask
                img.putdata(Image.fromarray(img_arr).getdata())
        else:
            # Outline only
            for region in self.regions:
                if len(region) >= 3:
                    vertices = region + np.array([[dx, dy]])
                    polygon = [tuple(v) for v in vertices]

                    ImageDraw.Draw(img).polygon(polygon, outline=1, fill=0)

    @staticmethod
    def regions_to_json(regions) -> Any:
        return [[dict(x=float(region[i,0]), y=float(region[i,1])) for i in range(len(region))]
                         for region in regions]

    def to_json(self) -> Any:
        js = super(PolygonLabel, self).to_json()
        js['regions'] = PolygonLabel.regions_to_json(self.regions)
        return js

    def __str__(self) -> str:
        return 'PolygonLabel(object_id={}, classification={}, regions={})'.format(
            self.object_id, self.classification, self.regions
        )

    @classmethod
    def new_instance_from_json(cls, label_json: Any, object_table: ObjectTable) -> AbstractLabel:
        if 'vertices' in label_json:
            regions_json = [label_json['vertices']]
        else:
            regions_json = label_json['regions']
        regions = [np.array([[v['x'], v['y']] for v in region_json]) for region_json in regions_json]
        return PolygonLabel(regions, label_json.get('object_id'),
                            classification=label_json['label_class'],
                            source=label_json.get('source'),
                            anno_data=label_json.get('anno_data'))

    @staticmethod
    def mask_image_to_regions(mask: np.ndarray) -> List[np.ndarray]:
        """
        Convert a mask label image to regions/contours that can be used as regions for a Polygonal label

        Uses Scikit-Image `find_contours`.

        :param mask: a mask image as  `(h,w)` numpy array (preferable of dtype bool) that identifies the pixels
            belonging to the object in question
        :return: regions as a list of NumPy arrays, where each array is (N, [x,y])
        """
        contours = []
        if mask.sum() > 0:
            mask_positions = np.argwhere(mask)
            (ystart, xstart), (ystop, xstop) = mask_positions.min(0), mask_positions.max(0) + 1

            if ystop >= ystart+1 and xstop >= xstart+1:
                mask_trim = mask[ystart:ystop, xstart:xstop]
                mask_trim = np.pad(mask_trim, [(1,1), (1,1)], mode='constant').astype(np.float32)
                cs = find_contours(mask_trim, 0.5)
                for contour in cs:
                    simp = _simplify_contour(contour + np.array((ystart, xstart)) - np.array([[1.0, 1.0]]))
                    if simp is not None:
                        contours.append(simp[:, ::-1])
        return contours

    @staticmethod
    def mask_image_to_regions_cv(mask: np.ndarray, sort_decreasing_area: bool = True) -> List[np.ndarray]:
        """
        Convert labels represented as a sequence of mask images to an `ImageLabels` instance.
        Mask to contour conversion performed using OpenCV `findContours`, finding external contours only.

        Raises RuntimeError is OpenCV is not available.

        :param mask: a mask image as  `(h,w)` numpy array (preferable of dtype bool) that identifies the pixels
            belonging to the object in question
        :param sort_decreasing_area: if True, regions are sorted in order of decreasing area
        :return: regions as a list of NumPy arrays, where each array is (N, [x,y])
        """
        if cv2 is None:
            raise RuntimeError('OpenCV is not available!')

        result = cv2.findContours((mask != 0).astype(np.uint8), cv2.RETR_LIST,
                                  cv2.CHAIN_APPROX_TC89_L1)
        if len(result) == 3:
            _, image_contours, _ = result
        else:
            image_contours, _ = result

        image_contours = [contour[:, 0, :] for contour in image_contours if len(contour) >= 3]

        if len(image_contours) > 0:
            # Compute area
            areas = ImageLabels._contour_areas(image_contours)

            if sort_decreasing_area:
                # Sort in order of decreasing area
                order = np.argsort(areas)[::-1]
                image_contours = [image_contours[i] for i in order]

        return image_contours


@label_cls
class BoxLabel (AbstractLabel):
    __json_type_name__ = 'box'

    def __init__(self, centre_xy, size_xy, object_id=None, classification=None, source=None, anno_data=None):
        """
        Constructor

        :param centre_xy: centre of box as a (2,) NumPy array providing the x and y co-ordinates
        :param size_xy: size of box as a (2,) NumPy array providing the x and y co-ordinates
        :param object_id: a unique integer object ID or None
        :param classification: a str giving the label's ground truth classification
        :param source: [optional] a str stating how the label was created
            (e.g. 'manual', 'auto:dextr', 'auto:maskrcnn', etc)
        :param anno_data: [optional] a dict mapping field names to values
        """
        super(BoxLabel, self).__init__(object_id, classification, source, anno_data)
        self.centre_xy = np.array(centre_xy).astype(float)
        self.size_xy = np.array(size_xy).astype(float)

    def bounding_box(self, ctx: Optional[LabelContext] = None) -> Tuple[Optional[np.ndarray], Optional[np.ndarray]]:
        return self.centre_xy - self.size_xy * 0.5, self.centre_xy + self.size_xy * 0.5

    def _warp(self, xform_fn: Callable[[np.ndarray], np.ndarray], object_table: ObjectTable) -> AbstractLabel:
        corners = np.array([
            self.centre_xy + self.size_xy * -0.5,
            self.centre_xy + self.size_xy * np.array([0.5, -0.5]),
            self.centre_xy + self.size_xy * 0.5,
            self.centre_xy + self.size_xy * np.array([-0.5, 0.5]),
        ])
        xf_corners = xform_fn(corners)
        lower = xf_corners.min(axis=0)
        upper = xf_corners.max(axis=0)
        xf_centre = (lower + upper) * 0.5
        xf_size = upper - lower
        return BoxLabel(xf_centre, xf_size, self.object_id, self.classification, self.source, self.anno_data)

    def _render_mask(self, img: Image, fill: bool, dx: float=0.0, dy: float=0.0,
                     ctx: Optional[LabelContext] = None):
        # Rendering helper function: create a binary mask for a given label

        centre = self.centre_xy + np.array([dx, dy])
        lower = centre - self.size_xy * 0.5
        upper = centre + self.size_xy * 0.5

        if fill:
            ImageDraw.Draw(img).rectangle([tuple(lower), tuple(upper)], outline=1, fill=1)
        else:
            ImageDraw.Draw(img).rectangle([tuple(lower), tuple(upper)], outline=1, fill=0)

    def to_json(self) -> Any:
        js = super(BoxLabel, self).to_json()
        js['centre'] = dict(x=self.centre_xy[0], y=self.centre_xy[1])
        js['size'] = dict(x=self.size_xy[0], y=self.size_xy[1])
        return js

    def __str__(self) -> str:
        return 'BoxLabel(object_id={}, classification={}, centre_xy={}, size_xy={})'.format(
            self.object_id, self.classification, self.centre_xy.tolist(), self.size_xy.tolist()
        )

    @classmethod
    def new_instance_from_json(cls, label_json: Any, object_table: ObjectTable) -> AbstractLabel:
        centre = np.array([label_json['centre']['x'], label_json['centre']['y']])
        size = np.array([label_json['size']['x'], label_json['size']['y']])
        return BoxLabel(centre, size, label_json.get('object_id'),
                        classification=label_json['label_class'],
                        source=label_json.get('source'),
                        anno_data=label_json.get('anno_data'))


@label_cls
class CompositeLabel (AbstractLabel):
    __json_type_name__ = 'composite'

    def __init__(self, components, object_id=None, classification=None, source=None, anno_data=None):
        """
        Constructor

        :param components: a list of label objects that are members of the composite label
        :param object_id: a unique integer object ID or None
        :param classification: a str giving the label's ground truth classification
        :param source: [optional] a str stating how the label was created
            (e.g. 'manual', 'auto:dextr', 'auto:maskrcnn', etc)
        :param anno_data: [optional] a dict mapping field names to values
        """
        super(CompositeLabel, self).__init__(object_id, classification, source, anno_data)
        self.components = components

    @property
    def dependencies(self) -> Sequence[AbstractLabel]:
        return self.components

    def bounding_box(self, ctx: Optional[LabelContext] = None) -> Tuple[Optional[np.ndarray], Optional[np.ndarray]]:
        return None, None

    def _warp(self, xform_fn: Callable[[np.ndarray], np.ndarray], object_table: ObjectTable) -> AbstractLabel:
        warped_components = []
        for comp in self.components:
            if comp.object_id in object_table:
                warped_comp = object_table[comp.object_id]
            else:
                warped_comp = comp.warped(xform_fn, object_table)
            warped_components.append(warped_comp)
        return CompositeLabel(warped_components, self.object_id, self.classification, self.source, self.anno_data)

    def _render_mask(self, img: Image, fill: bool, dx: float=0.0, dy: float=0.0,
                     ctx: Optional[LabelContext] = None):
        return None

    def to_json(self) -> Any:
        js = super(CompositeLabel, self).to_json()
        js['components'] = [component.object_id for component in self.components]
        return js

    def __str__(self) -> str:
        return 'CompositeLabel(object_id={}, classification={}, ids(components)={}'.format(
            self.object_id, self.classification, [c.object_id for c in self.components]
        )

    @classmethod
    def new_instance_from_json(cls, label_json: Any, object_table: ObjectTable) -> AbstractLabel:
        component_ids = [object_table._new_style_id(obj_id) for obj_id in label_json['components']]
        components = [object_table.get(obj_id) for obj_id in component_ids]
        components = [comp for comp in components if comp is not None]
        return CompositeLabel(components, label_json.get('object_id'),
                              classification=label_json['label_class'],
                              source=label_json.get('source'),
                              anno_data=label_json.get('anno_data'))


@label_cls
class GroupLabel (AbstractLabel):
    __json_type_name__ = 'group'

    def __init__(self, component_labels, object_id=None, classification=None, source=None, anno_data=None):
        """
        Constructor

        :param component_labels: a list of label objects that are members of the group label
        :param object_id: a unique integer object ID or None
        :param classification: a str giving the label's ground truth classification
        :param source: [optional] a str stating how the label was created
            (e.g. 'manual', 'auto:dextr', 'auto:maskrcnn', etc)
        :param anno_data: [optional] a dict mapping field names to values
        """
        super(GroupLabel, self).__init__(object_id, classification, source, anno_data)
        self.component_labels = component_labels

    def flatten(self) -> Generator[AbstractLabel, None, None]:
        for comp in self.component_labels:
            for f in comp.flatten():
                yield f
        yield self

    def bounding_box(self, ctx: Optional[LabelContext] = None) -> Tuple[Optional[np.ndarray], Optional[np.ndarray]]:
        lowers, uppers = list(zip(*[comp.bounding_box(ctx) for comp in self.component_labels]))
        lowers = [x for x in lowers if x is not None]
        uppers = [x for x in uppers if x is not None]
        if len(lowers) > 0 and len(uppers) > 0:
            return np.array(lowers).min(axis=0), np.array(uppers).max(axis=0)
        else:
            return None, None

    def _warp(self, xform_fn: Callable[[np.ndarray], np.ndarray], object_table: ObjectTable) -> AbstractLabel:
        comps = [comp.warped(xform_fn, object_table) for comp in self.component_labels]
        return GroupLabel(comps, self.object_id, self.classification, self.source, self.anno_data)

    def _render_mask(self, img: Image, fill: bool, dx: float=0.0, dy: float=0.0,
                     ctx: Optional[LabelContext] = None):
        for label in self.component_labels:
            label._render_mask(img, fill, dx, dy, ctx)

    def to_json(self) -> Any:
        js = super(GroupLabel, self).to_json()
        js['component_models'] = [component.to_json() for component in self.component_labels]
        return js

    def __str__(self) -> str:
        return 'GroupLabel(object_id={}, classification={}, component_labels={}'.format(
            self.object_id, self.classification, self.component_labels
        )

    @classmethod
    def new_instance_from_json(cls, label_json: Any, object_table: ObjectTable) -> AbstractLabel:
        components = [AbstractLabel.from_json(comp, object_table)
                      for comp in label_json['component_models']]
        return GroupLabel(components, label_json.get('object_id'),
                          classification=label_json['label_class'],
                          source=label_json.get('source'),
                          anno_data=label_json.get('anno_data'))


_ClassIndexMappingFunction = Callable[[str], Optional[int]]
_ClassIndexMappingMap = Mapping[str, int]
_ClassIndexMappingCls = Union[str, LabelClass, None]
_ClassIndexMappingListEntry = Union[str, LabelClass, None, Sequence[_ClassIndexMappingCls]]
_ClassIndexMappingList = Sequence[_ClassIndexMappingListEntry]

ClassIndexMapping = Union[_ClassIndexMappingFunction,
                          _ClassIndexMappingMap,
                          _ClassIndexMappingList]

class ImageLabels:
    """
    Represents labels in vector format, stored in JSON form. Has methods for
    manipulating and rendering them.

    """
    def __init__(self, labels: List[AbstractLabel], obj_table: Optional[ObjectTable] = None,
                 id_prefix: Optional[str] = None):
        self.labels = labels
        if obj_table is None:
            obj_table = ObjectTable(id_prefix, list(self.flatten()))
        self._obj_table = obj_table

    def __len__(self) -> int:
        return len(self.labels)

    def __getitem__(self, item: Union[int, str, slice, Sequence[Union[str, int]]]) -> \
            Union[AbstractLabel, 'ImageLabels']:
        if isinstance(item, int):
            return self.labels[item]
        elif isinstance(item, str):
            return self._obj_table[item]
        elif isinstance(item, slice):
            return self.retain(item)
        elif isinstance(item, Sequence):
            return self.retain(item)
        else:
            raise TypeError('item should be an int, a str, a slice or a sequence, not a {}'.format(type(item)))

    def flatten(self) -> Generator[AbstractLabel, None, None]:
        for lab in self.labels:
            for f in lab.flatten():
                yield f

    def label_class_histogram(self) -> Mapping[str, int]:
        histogram = {}
        for lab in self.labels:
            lab.fill_label_class_histogram(histogram)
        return histogram

    def retain(self, items: Union[slice, Sequence[Union[str, int]]], id_prefix: Optional[str] = None) -> 'ImageLabels':
        """
        Create a clone of the labels listed in `items`

        :param items: Either a slice, or a list of indices/object IDs that identify the labels to be kept
        :param id_prefix: the object ID prefix that will be to create object IDs for labels added to
            the returned `ImageLabels` instance
        :return: `ImageLabels` instance
        """
        if isinstance(items, slice):
            retained_labels = copy.deepcopy(self.labels[items])
        else:
            retained_labels = []
            for item in items:
                if isinstance(item, str):
                    retained_labels.append(copy.deepcopy(self._obj_table[item]))
                else:
                    retained_labels.append(copy.deepcopy(self.labels[item]))

        if id_prefix is None:
            id_prefix = str(uuid.uuid4())
        obj_table = ObjectTable(id_prefix=id_prefix)

        return ImageLabels(retained_labels, obj_table=obj_table)

    def warp(self, xform_fn: Callable[[np.ndarray], np.ndarray]) -> 'ImageLabels':
        """
        Warp the labels given a warping function

        :param xform_fn: a transformation function of the form `f(vertices) -> warped_vertices`, where `vertices` and
        `warped_vertices` are both Numpy arrays of shape `(N,2)` where `N` is the number of vertices and the
        co-ordinates are `x,y` pairs. The transformations defined in `skimage.transform`, e.g. `AffineTransform` can
        be used here.
        :return: an `ImageLabels` instance that contains the warped labels
        """
        warped_obj_table = ObjectTable(id_prefix=str(uuid.uuid4()))
        warped_labels = [lab.warped(xform_fn, warped_obj_table) for lab in self.labels]
        return ImageLabels(warped_labels, obj_table=warped_obj_table)

    def _label_class_list_to_mapping_fn(self, label_classes: ClassIndexMapping, start_at: int = 0) -> \
            Tuple[Callable[[str], Optional[int]], int]:
        """
        Coerce `label_classes` to a tuple of a mapping function that maps label class name (string) to class index
        (or None to skip) and the number of classes.

        If `label_classes` is callable then use it as is. We do however invoke `label_classes` for the class
            of every label and take the maximum class index returned in order to determine the number of classes.

        If `label_classes` is a mapping, return its `get` method, along with the number of classes.

        If `label_classes` is a list, then each entry should be a class (class name as a str or
            a `LabelClass` instance) or list of classes (str/LabelClass).
            The class or classes in each entry is/are mapped to the position of the entry, with the offset
            `start_at` applied.
            For example `['a', ['b', 'c'], 'd']` will map the class 'a' to 0, 'b' and 'c' to 1 and 'd' to 2.

        :param label_classes: the mapping as a function, dictionary or list.
        :param start_at: class index offset used if `label_classes` is a list, ignored otherwise
        :return: `(cls_name_to_index_fn, n_classes)` where `cls_name_to_index_fn` is a function of the form
            `f(class_name) -> index` and `n_classes` is the number of classes
        """
        if isinstance(label_classes, Mapping):
            # Dict, compute number of classes and return along with `get` method
            n_classes = max(label_classes.values()) + 1
            return label_classes.get, n_classes
        elif callable(label_classes):
            # Function: determine number of classes and return
            n_classes = 0
            for label in self.labels:
                cls_i = label_classes(label.classification)
                if cls_i is not None:
                    n_classes = max(n_classes, cls_i + 1)
            return label_classes, n_classes
        elif isinstance(label_classes, Sequence):
            # List
            cls_to_index = {}
            for i, cls in enumerate(label_classes):
                if isinstance(cls, LabelClass):
                    cls_to_index[cls.name] = i + start_at
                elif isinstance(cls, str)  or  cls is None:
                    cls_to_index[cls] = i + start_at
                elif isinstance(cls, list)  or  isinstance(cls, tuple):
                    for c in cls:
                        if isinstance(c, LabelClass):
                            cls_to_index[c.name] = i + start_at
                        elif isinstance(c, str)  or  c is None:
                            cls_to_index[c] = i + start_at
                        else:
                            raise TypeError('Item {0} in label_classes is a list that contains an item that is not a '
                                            'LabelClass or a string but a {1}'.format(i, type(c).__name__))
                else:
                    raise TypeError('Item {0} in label_classes is not a LabelClass, string or list, '
                                    'but a {1}'.format(i, type(cls).__name__))
            n_classes = len(label_classes)
            return (lambda cls_name: cls_to_index.get(cls_name, None)), n_classes
        else:
            raise TypeError('label_classes must be a dict or a sequence. The sequence can contain LabelClass '
                            'instances, strings or nested sequences of the former')

    def render_label_classes(self, label_classes: ClassIndexMapping, image_shape: Tuple[int, int],
                             multichannel_mask: bool = False, fill: bool = True, ctx: Optional[LabelContext] = None):
        """Render label classes to a create a label class image suitable for use as a
        semantic segmentation ground truth image.

        If `multichannel_mask` is False, then a label class image is generated. A label class image uses integer
        pixel values to indicate the class of the label the pixel belongs to. They cannot represent overlapping labels;
        in such cases labels that come later in the list will appear 'in front' of prior labels, overwriting them.
        A label class image is an array of shape `(height, width)` with integer dtype. A value of 0 represents
        background/empty. Each label is drawn into the image, with the value determined by its class index. Its
        class index is determined by the mapping provided as the `label_classes` parameter.

        If `multichannel_mask` is True, then a multi-channel mask is generated. A multi-channel mask
        is an array of shape `(height, width, n_classes)` with boolean dtype. Each label is drawn into the channel
        with the value `True` where the channel index is determined by its class index. Once again, the class
        index for a label is determined using the `label_classes` mapping.

        The label class mapping (`label_classes` parameter) is provided as either a callable/function,
        dictionary or sequence of classes:
            Function of the form `fn(class_name) -> class_index`: the function returns the class index given
                the label class name. If it returns `None` the label will be skipped. Note that when
                rendering a label image (`multichannel_mask` is `False`) the function should *not* return 0
                as that is the index given to the background.
            Dictionary: maps class name to class index. Uses the same rules when using a function, as above.
                We effectively use the `get` method of the dictionary as the mapping function.
            Sequence: each entry in the sequence should be a class (class name as a str or a `LabelClass` instance)
                or list of classes (str/LabelClass). The class or classes in each entry is/are mapped to the
                position of the entry, where the position starts at 1 for label images or 0 for multi-channel
                masks. For example `['a', ['b', 'c'], 'd']` will map the class 'a' to class index 1 for
                a label class image or channel 0 for multi-channel mask, 'b' and 'c' to class index 2/channel 1
                and 'd' to class index 3/channel 2.

        :param label_classes: label class mapping as described above
        :param image_shape: `(height, width)` tuple specifying the shape of the image to be returned
        :param multichannel_mask: If `False`, return a label image (`(height, width)` shaped array of dtype=int)
            If `True` return a multi-channel mask (`(height, width, n_classes)` array of dtype=bool)
        :param fill: if True, labels will be filled, otherwise their outlines will be drawn
        :param ctx: [optional] a `LabelContext` instance that provides parameters that control the rendering
            of some labels (e.g. point labels)
        :return: label image as (H,W) array with dtype=int or multi-channel mask as (H,W,n_classes) array
            with dtype=bool
        """
        cls_to_index_fn, n_classes = self._label_class_list_to_mapping_fn(
            label_classes, 0 if multichannel_mask else 1)

        height, width = image_shape

        if multichannel_mask:
            label_image = np.zeros((height, width, n_classes), dtype=bool)
        else:
            label_image = np.zeros((height, width), dtype=int)

        for label in self.labels:
            label_cls_n = cls_to_index_fn(label.classification,)
            if label_cls_n is not None:
                mask = label.render_mask(width, height, fill, ctx=ctx)
                if mask is not None:
                    mask = mask >= 0.5
                    if multichannel_mask:
                        label_image[:,:,label_cls_n] |= mask
                    else:
                        label_image[mask] = label_cls_n

        return label_image

    def render_label_instances(self, label_classes: Optional[ClassIndexMapping], image_shape: Tuple[int, int],
                               multichannel_mask: bool = False, fill: bool = True,
                               return_object_ids: bool = False, ctx: Optional[LabelContext] = None):
        """Render a label instance image suitable for use as an instance segmentation ground truth image.
        Can render either a label image or a multi-channel mask.

        If `multichannel_mask` is False, then a label image is generated. A label image uses integer pixel values
        to indicate which label the pixel belongs to. They cannot represent overlapping labels; in such cases labels
        that come later in the list will appear 'in front' of prior labels. A label image is an array of shape
        `(height, width)` with integer dtype. A value of 0 represents background/empty. Each label is drawn
        into the image, with an instance index starting at 1, incrementing with each label that is drawn.
        Labels skipped as a result of the `label_classes` mapping indicating as such will not cause the instance
        index to increment).

        A multi-channel mask image has a boolean dtype and uses one channel or mask for each label/instance, where
        a pixel value of `True` indicates that the corresponding label covers that pixel. Overlapping labels are
        faithfully represented. A multi-channel mask is an array of shape `(height, width, n_instances)` with
        boolean dtype. Each label/instance is drawn into a `(height, width)` shaped mask image that is added to
        the stack of masks/channels. Labels that are skipped as indicated by the mapping in `label_classes`
        do *not* result add anything to the result.

        In addition to the label image or multi-channel mask this method also returns `label_index_to_cls`; a
        label index to class mapping that gives the class index of each label that was rendered.
        If `self` consists of one label and that label class is mapped to a class index of 5,
        if `multichannel_mask` is `False` this method will render a label image with a value of 1 in the
        pixels covered by the label and `label_index_to_cls` will have the values `[0, 5]`, with the first entry
        corresponding to the background. If `multichannel_mask` is `True` the resulting multi-channel mask
        will have one channel that will be `True` for pixels covered by the label and `label_index_to_cls`
        will have the value `[5]`.

        If `return_object_ids` is `True` then the unique object IDs (a UUID strong followed by underscores and
        an index) of the rendered labels will also be returned. The list of object IDs will follow the same form
        as `label_index_to_cls`; if `multichannel_mask` is `False` then the first entry that corresponds to the
        background will have an object ID of `None`, otherwise if `True` then the background will not have
        an object ID.

        The class indices are determined by thee label class mapping (`label_classes` parameter) that is provided
        as either a callable/function, dictionary, sequence of classes or None:
            Function of the form `fn(class_name) -> class_index`: the function returns the class index given
                the label class name. If it returns `None` the label will be skipped. Returning 0
                does not pose the same problems as with the `render_label_classes` method as the background
                class 0 only appears in the first entry of `label_index_to_cls`.
            Dictionary: maps class name to class index. Uses the same rules when using a function, as above.
                We effectively use the `get` method of the dictionary as the mapping function.
            Sequence: each entry in the sequence should be a class (class name as a str or a `LabelClass` instance)
                or list of classes (str/LabelClass). The class or classes in each entry is/are mapped to the
                position of the entry, where the position starts at 1. For example `['a', ['b', 'c'], 'd']` will
                map the class 'a' to 1, 'b' and 'c' to 2 and 'd' to 3.
            None: all labels will be rendered and assigned a class index of 1

        :param label_classes: label class mapping as described above
        :param image_shape: `(height, width)` tuple specifying the shape of the image to be returned
        :param multichannel_mask: If `False`, return a label image (`(height, width)` shaped array of dtype=int)
            If `True` return a multi-channel mask (`(height, width, n_classes)` array of dtype=bool)
        :param fill: if True, labels will be filled, otherwise their outlines will be drawn
        :param return_object_ids: if True, the returned tuple will contain a list that gives the object ID of
            each instance
        :param ctx: [optional] a `LabelContext` instance that provides parameters that control the rendering
            of some labels (e.g. point labels)
        :return: tuple of (label_image, label_index_to_cls) or (label_image, label_index_to_cls, object_ids) where:
            label_image is a (H,W) or (H,W,N) array with dtype=int
            label_index_to_cls is a 1D array that gives the class index of each labels. If `multichannel_mask` is
                False, the first entry at index 0 will have a value of 0 as it is the background label.
            object_ids: a list containing the object ID for each label/instance (only present if return_object_ids
                is True). If `multichannel_mask` is False, the first entry at index 0 will have a value of None as it
                is the background label.
        """
        if label_classes is not None:
            cls_to_index_fn, _ = self._label_class_list_to_mapping_fn(label_classes, 1)
        else:
            cls_to_index_fn = None

        height, width = image_shape

        if multichannel_mask:
            label_image = None
            label_image_stack = []
        else:
            label_image = np.zeros((height, width), dtype=int)
            label_image_stack = None

        if multichannel_mask:
            label_i = 0
            label_index_to_cls = []
            object_ids = []
        else:
            label_i = 1
            label_index_to_cls = [0]
            object_ids = [None]


        for label in self.labels:
            if cls_to_index_fn is not None:
                label_cls = cls_to_index_fn(label.classification)
            else:
                label_cls = 1
            if label_cls is not None:
                mask = label.render_mask(width, height, fill, ctx=ctx)
                if mask is not None:
                    mask = mask >= 0.5
                    if multichannel_mask:
                        label_image_stack.append(mask)
                    else:
                        label_image[mask] = label_i
                    label_index_to_cls.append(label_cls)
                    object_ids.append(label.object_id)
                    label_i += 1

        if multichannel_mask:
            if len(label_image_stack) > 0:
                label_image = np.stack(label_image_stack, axis=2)
            else:
                label_image = np.zeros((height, width, 0), dtype=int)

        if return_object_ids:
            return label_image, np.array(label_index_to_cls), object_ids
        else:
            return label_image, np.array(label_index_to_cls)

    def extract_label_images(self, image_2d: np.ndarray, label_class_set: Optional[Container[str]]=None,
                             ctx: Optional[LabelContext]=None):
        """Extract an image of each labelled entity from a given image.
        The resulting image is the original image masked with an alpha channel that results from rendering the label

        :param image_2d: the image from which to extract images of labelled objects
        :param label_class_set: a set or sequence of classes whose labels should be rendered, or None for all labels
        :param ctx: [optional] a `LabelContext` instance that provides parameters
        :return: a list of (H,W,C) image arrays
        """
        image_shape = image_2d.shape[:2]

        label_images = []

        for label in self.labels:
            if label_class_set is None or label.classification in label_class_set:
                bounds = label.bounding_box(ctx=ctx)

                if bounds[0] is not None and bounds[1] is not None:
                    lx = int(math.floor(bounds[0][0]))
                    ly = int(math.floor(bounds[0][1]))
                    ux = int(math.ceil(bounds[1][0]))
                    uy = int(math.ceil(bounds[1][1]))

                    # Given that the images and labels may have been warped by a transformation,
                    # there is no guarantee that they lie within the bounds of the image
                    lx = max(min(lx, image_shape[1]), 0)
                    ux = max(min(ux, image_shape[1]), 0)
                    ly = max(min(ly, image_shape[0]), 0)
                    uy = max(min(uy, image_shape[0]), 0)

                    w = ux - lx
                    h = uy - ly

                    if w > 0 and h > 0:
                        mask = label.render_mask(w, h, fill=True, dx=float(-lx), dy=float(-ly), ctx=ctx)
                        if mask is not None and (mask > 0).any():
                            img_box = image_2d[ly:uy, lx:ux]
                            if len(img_box.shape) == 2:
                                # Convert greyscale image to RGB:
                                img_box = gray2rgb(img_box)
                            # Append the mask as an alpha channel
                            object_img = np.append(img_box, mask[:, :, None] * 255, axis=2)

                            label_images.append(object_img)

        return label_images

    def to_json(self) -> Any:
        return [lab.to_json() for lab in self.labels]

    def replace_json(self, existing_json: Any) -> Any:
        if isinstance(existing_json, dict):
            new_dict = {}
            new_dict.update(existing_json)
            new_dict['labels'] = self.to_json()
            return new_dict
        elif isinstance(existing_json, list):
            return self.to_json()
        else:
            raise ValueError('existing_json should be a list or a dict')

    def wrapped_json(self, image_filename: str, completed_tasks: List[str]) -> Any:
        return {'image_filename': image_filename,
                'completed_tasks': completed_tasks,
                'labels': self.to_json()}

    @classmethod
    def merge(cls, *image_labels: 'ImageLabels') -> 'ImageLabels':
        """
        Merge multiple `ImageLabel` label collections.

        :param image_labels: `ImageLabel` instances to merge
        :return: `ImageLabels` instance
        """
        obj_table = ObjectTable(id_prefix=str(uuid.uuid4()))
        merged_labels = []
        for il in image_labels:
            merged_labels.extend(copy.deepcopy(il.labels))
        used_ids = set()
        for label in merged_labels:
            for f_label in label.flatten():
                if f_label.object_id in used_ids:
                    f_label.object_id = None
                else:
                    used_ids.add(f_label.object_id)
        return ImageLabels(merged_labels, obj_table=obj_table)

    @staticmethod
    def from_json(label_data_js: Any, id_prefix: Optional[str] = None) -> 'ImageLabels':
        """
        Load from labels in JSON format

        :param label_data_js: either a list of labels in JSON format or a dict that maps the key `'labels'` to a list
        of labels in JSON form. The dict format will match the format stored in JSON label files.

        :return: an `ImageLabels` instance
        """
        if isinstance(label_data_js, dict):
            if 'labels' not in label_data_js:
                raise ValueError('label_js should be a list or a dict containing a \'labels\' key')
            labels = label_data_js['labels']
            if not isinstance(labels, list):
                raise TypeError('labels[\'labels\'] should be a list')
        elif isinstance(label_data_js, list):
            labels = label_data_js
        else:
            raise ValueError('label_data_js should be a list or a dict containing a \'labels\' key, it is a {}'.format(
                type(label_data_js)
            ))

        if id_prefix is None:
            id_prefix = str(uuid.uuid4())
        obj_table = ObjectTable(id_prefix=id_prefix)
        labs = [AbstractLabel.from_json(label, obj_table) for label in labels]
        return ImageLabels(labs, obj_table=obj_table)

    @staticmethod
    def from_file(f: Union[str, pathlib.Path, IO]) -> 'ImageLabels':
        if isinstance(f, str):
            f = pathlib.Path(f).open('r')
        elif isinstance(f, pathlib.Path):
            f = f.open('r')
        elif isinstance(f, io.IOBase):
            pass
        else:
            raise TypeError('f should be a path as a string or `pathlib.Path` or a file, not a {}'.format(type(f)))
        return ImageLabels.from_json(json.load(f))

    @classmethod
    def from_contours(cls, label_contours: Sequence[Sequence[np.ndarray]],
                      label_classes: Optional[Union[str, Sequence[str]]] = None,
                      sources: Optional[Union[str, Sequence[str]]] = None,
                      id_prefix: Optional[str] = None) -> 'ImageLabels':
        """
        Convert a list of contours to an `ImageLabels` instance.

        :param label_contours: list of list of contours. The outer list contains one item per label,
                with the inner lists containing the contours that should be grouped to form a label.
                Each contour is an `(N, (y, x))` numpy array.
                If an inner list contains one contour, a polygonal label is created to represent it.
                If it contains more than one, a polygonal label is created for each member contour
                and they are combined with a group.
        :param label_classes: [optional] a list of the same length as `list_of_contours` that provides
                the label class of each contour, or a string to assign the same class to every label
        :param sources: [optional] a list of the same length as `list_of_contours` that provides
                the source of each contour, or a string to assign the same source to every label
        :return: an `ImageLabels` instance containing the labels extracted from the contours
        """
        if id_prefix is None:
            id_prefix = str(uuid.uuid4())
        obj_table = ObjectTable(id_prefix=id_prefix)
        labels = []
        if isinstance(label_classes, str) or label_classes is None:
            label_classes = itertools.repeat(label_classes)
        if isinstance(sources, str) or sources is None:
            sources = itertools.repeat(sources)
        for contours_in_label, lcls, lsrc in zip(label_contours, label_classes, sources):
            regions = [contour[:, ::-1] for contour in contours_in_label]
            poly = PolygonLabel(regions, classification=lcls, source=lsrc)
            obj_table.register(poly)
            labels.append(poly)

        return cls(labels, obj_table=obj_table)


    @staticmethod
    def _get_label_meta(meta: Optional[Union[str, Mapping, Sequence]], label_i) -> Optional[Any]:
        """
        Get label metadata from a metadata mapping:
        - if `meta` is None, will return `None`
        - if `meta` is a str, will return `meta`
        - if `meta` is a dict, will return `meta.get(label_i)`
        - if `meta` is a list, will return `meta[label_i]`

        :param meta: metadata mapping
        :param label_i: label index
        :return: label metadata
        """
        if meta is None or isinstance(meta, str):
            return meta
        elif isinstance(meta, Mapping):
            return meta.get(label_i)
        elif isinstance(meta, Sequence):
            return meta[label_i]
        else:
            raise TypeError('should be None, str, dict or list, not a {}'.format(type(meta)))

    @classmethod
    def from_label_image(cls, labels: np.ndarray, label_classes: Optional[Union[str, Sequence[str]]] = None,
                         sources: Optional[Union[str, Sequence[str]]] = None,
                         return_label_indices: bool = False) -> Union['ImageLabels', Tuple['ImageLabels', List[int]]]:
        """
        Convert a integer label image to an `ImageLabels` instance.

        Converts label images to contours using Scikit-Image `find_contours`.

        :param labels: a `(h,w)` numpy array of dtype `int32` that gives an integer label for each
                pixel in the image. Label values start at 1; pixels with a value of 0 will not be
                included in the returned labels.
        :param label_classes: [optional] either:
                - a list that provides the class of each integer label (element 0 will be ignored)
                - a dict that maps label index to class
                - a string to assign the same class to every label
        :param sources: [optional] provides label sources; has the same format as `label_classes`
        :param return_label_indices: (default False) if True, return the index of the label used for each label
            in the returned `ImageLabels`
        :return: an `ImageLabels` instance containing the labels extracted from the label mask image, or
            a tuple of `(image_labels, label_indices)` where `image_labels` is an `ImageLabels` instance and
            `label_indices` gives the label index for each vectorized label in `image_labels`

        """
        if label_classes is not None and not isinstance(label_classes, (str, dict, list)):
            raise TypeError('label_classes should be None, a str, a dict or a list, not {}'.format(type(label_classes)))
        if sources is not None and not isinstance(sources, (str, dict, list)):
            raise TypeError('sources should be None, a str, a dict or a list, not {}'.format(type(sources)))
        contours = []
        lcls = []
        lsrc = []
        label_indices = []
        n_labels = labels.max()
        for i in range(1, n_labels+1):
            lmask = labels == i

            if lmask.sum() > 0:
                mask_positions = np.argwhere(lmask)
                (ystart, xstart), (ystop, xstop) = mask_positions.min(0), mask_positions.max(0) + 1

                if ystop >= ystart+1 and xstop >= xstart+1:
                    mask_trim = lmask[ystart:ystop, xstart:xstop]
                    mask_trim = np.pad(mask_trim, [(1,1), (1,1)], mode='constant').astype(np.float32)
                    cs = find_contours(mask_trim, 0.5)
                    regions = []
                    for contour in cs:
                        simp = _simplify_contour(contour + np.array((ystart, xstart)) - np.array([[1.0, 1.0]]))
                        if simp is not None:
                            regions.append(simp)
                    contours.append(regions)
                    lcls.append(cls._get_label_meta(label_classes, i))
                    lsrc.append(cls._get_label_meta(sources, i))
                    label_indices.append(i)

        img_labels = cls.from_contours(contours, lcls, lsrc)

        if return_label_indices:
            return img_labels, label_indices
        else:
            return img_labels

    @staticmethod
    def _contour_areas(contours: Sequence[np.ndarray]) -> np.ndarray:
        contour_areas = []
        for contour in contours:
            # Vectors from vertex 0 to all others
            u = contour[1:, :] - contour[0:1, :]
            contour_area = np.cross(u[:-1, :], u[1:, :]).sum() / 2
            contour_area = abs(float(contour_area))
            contour_areas.append(contour_area)
        return np.array(contour_areas)

    @classmethod
    def from_mask_images_cv(cls, masks: Sequence[np.ndarray],
                            label_classes: Optional[Union[str, Sequence[str]]] = None,
                            sources: Optional[Union[str, Sequence[str]]] = None, sort_decreasing_area: bool = True,
                            return_mask_indices: bool = False) -> \
            Union['ImageLabels', Tuple['ImageLabels', List[int]]]:
        """
        Convert labels represented as a sequence of mask images to an `ImageLabels` instance.
        Mask to contour conversion performed using OpenCV `findContours`, finding external contours only.

        Raises RuntimeError is OpenCV is not available.

        :param masks: a sequence of mask images - can be a generator or a 3D array. Each mask is a `(H,W)` array
            with non-zero values indicating pixels that are part of the label
        :param label_classes: [optional] either:
                - a list that provides the class of each mask
                - a dict that maps mask index to class
                - a string to assign the same class to every label
        :param sources: [optional] provides label sources; has the same format as `label_classes`
        :param sort_decreasing_area: (default True) if True, sort regions and labels in order of decreasing area
        :param return_mask_indices: (default False) if True, return the index of the mask used for each label
        :return: an `ImageLabels` instance, or
            a tuple of `(image_labels, mask_indices)` where `image_labels` is an `ImageLabels` instance and
            `mask_indices` gives the mask index for each vectorized label in `image_labels`
        """
        if cv2 is None:
            raise RuntimeError('OpenCV is not available!')
        if label_classes is not None and not isinstance(label_classes, (str, dict, list)):
            raise TypeError('label_classes should be None or a str, dict or list, not a {}'.format(type(label_classes)))
        if sources is not None and not isinstance(sources, (str, dict, list)):
            raise TypeError('sources should be None or a str, dict or list, not a {}'.format(type(sources)))

        mask_areas = []
        contours_classes_sources = []
        mask_indices = []
        n_masks = 0
        for mask_i, lab_msk in enumerate(masks):
            result = cv2.findContours((lab_msk != 0).astype(np.uint8), cv2.RETR_LIST,
                                      cv2.CHAIN_APPROX_TC89_L1)
            if len(result) == 3:
                _, region_contours, _ = result
            else:
                region_contours, _ = result
            
            region_contours = [contour[:, 0, ::-1] for contour in region_contours if len(contour) >= 3]

            if len(region_contours) > 0:
                # Compute area
                areas = cls._contour_areas(region_contours)
                mask_areas.append(float(areas.sum()))

                if sort_decreasing_area:
                    # Sort in order of decreasing area
                    order = np.argsort(areas)[::-1]
                    region_contours = [region_contours[i] for i in order]

                mask_indices.append(mask_i)

                contours_classes_sources.append((region_contours,
                                                 cls._get_label_meta(label_classes, mask_i),
                                                 cls._get_label_meta(sources, mask_i)))

            n_masks += 1
        mask_areas = np.array(mask_areas)

        if sort_decreasing_area and len(contours_classes_sources) > 0:
            order = np.argsort(mask_areas)[::-1]
            contours_classes_sources = [contours_classes_sources[i] for i in order]

        if len(contours_classes_sources) > 0:
            image_contours, lcls, lsrc = list(zip(*contours_classes_sources))
            img_labels = cls.from_contours(image_contours, lcls, lsrc)
        else:
            img_labels = cls.from_contours([])

        if return_mask_indices:
            return img_labels, mask_indices
        else:
            return img_labels


_INT_ID_PAT = re.compile('\d+')

def _generic_obj_id_update_helper(labels_json, id_prefix, id_remapping, idx_counter_in_list):
    modified = False
    if isinstance(labels_json, list):
        for x in labels_json:
            m = _generic_obj_id_update_helper(x, id_prefix, id_remapping, idx_counter_in_list)
            modified = modified or m
    elif isinstance(labels_json, dict):
        if 'label_type' in labels_json and 'label_class' in labels_json:
            # Its a label
            obj_id = labels_json.get('object_id')
            if obj_id is None:
                obj_id = '{}__{}'.format(id_prefix, idx_counter_in_list[0])
                idx_counter_in_list[0] += 1
                labels_json['object_id'] = obj_id
                modified = True
            if isinstance(obj_id, int):
                new_id = '{}__{}'.format(id_prefix, obj_id)
                labels_json['object_id'] = new_id
                id_remapping[obj_id] = new_id
                modified = True
            elif isinstance(obj_id, str):
                match = _INT_ID_PAT.match(obj_id)
                if match is not None and match.end(0) == len(obj_id):
                    new_id = '{}__{}'.format(id_prefix, obj_id)
                    labels_json['object_id'] = new_id
                    id_remapping[obj_id] = new_id
                    modified = True

        for x in labels_json.values():
            m = _generic_obj_id_update_helper(x, id_prefix, id_remapping, idx_counter_in_list)
            modified = modified or m

    return modified


def _composite_obj_id_update_helper(labels_json, id_remapping):
    modified = False
    if isinstance(labels_json, list):
        for x in labels_json:
            m = _composite_obj_id_update_helper(x, id_remapping)
            modified = modified or m
    elif isinstance(labels_json, dict):
        if 'label_type' in labels_json and 'label_class' in labels_json:
            # Its a label;
            if labels_json['label_type'] == 'composite':
                component_ids = labels_json['components']
                new_component_ids = [id_remapping.get(x, x) for x in component_ids]
                if new_component_ids != component_ids:
                    modified = True
                    labels_json['components'] = new_component_ids

        for x in labels_json.values():
            m = _composite_obj_id_update_helper(x, id_remapping)
            modified = modified or m

    return modified


def ensure_json_object_ids_have_prefix(labels_json, id_prefix, id_remapping=None, idx_counter_in_list=None):
    """
    Fix JSON label representation, by prefixing object IDs with `id_prefix`.

    Modifies JSON data in place.

    Exmaple:
    >>> import uuid
    >>> id_prefix = str(uuid.uuid4())
    >>> ensure_json_object_ids_have_prefix(labels_json, id_prefix)

    :param labels_json: labels in JSON form
    :param id_prefix: object ID prefix
    :return: True if JSON data was changed
    """
    if id_prefix.strip() == '':
        raise ValueError('id_prefix should not be empty or whitespace')
    idx_counter_in_list = [1]
    id_remapping = {}
    m1 = _generic_obj_id_update_helper(labels_json, id_prefix, id_remapping, idx_counter_in_list)
    m2 = _composite_obj_id_update_helper(labels_json, id_remapping)
    return m1 or m2


class WrappedImageLabels:
    def __init__(self, image_filename: Optional[str] = None, completed_tasks: Optional[Container[str]] = None,
                 metadata: Optional[Dict] = None, labels_json: Optional[Any] = None,
                 labels: Optional[ImageLabels] = None):
        """
        :param image_filename: the image filename as a string
        :param completed_tasks: a list of completed tasks
        :param metadata: metadata as a dictionary
        :param labels_json: labels in JSON form (labels parameter should be None if labels_json provided)
        :param labels: labels as an `ImageLabels` instance (labels_json parameter should be None if labels provided)
        """
        if labels_json is None and labels is None:
            raise ValueError('Either labels_json should be provided or image_labels should be provided')
        if labels_json is not None and labels is not None:
            raise ValueError('Either labels_json should be provided or image_labels should be provided, not both')
        if metadata is None:
            metadata = {}
        if completed_tasks is None:
            completed_tasks = []
        self.image_filename = image_filename
        self.completed_tasks = completed_tasks
        self.metadata = metadata
        self.__labels_json = labels_json
        self.__labels = labels

    @property
    def labels(self) -> ImageLabels:
        if self.__labels is None:
            self.__labels = ImageLabels.from_json(self.__labels_json)
            self.__labels_json = None
        return self.__labels

    @labels.setter
    def labels(self, lab: ImageLabels):
        self.__labels = lab
        self.__labels_json = None

    @property
    def labels_json(self) -> Any:
        if self.__labels_json is not None:
            return self.__labels_json
        elif self.__labels is not None:
            return self.__labels.to_json()
        else:
            raise RuntimeError

    @labels_json.setter
    def labels_json(self, js: Any):
        self.__labels_json = js
        self.__labels = None

    @property
    def is_blank(self) -> bool:
        """Determine if these wrapped labels are blank. If they are blank, then there is no data store, so
        e.g. a labels file can be deleted. A `WrappedLabelsInstance` is considered blank if no
        labels/annotations are defined and no tasks have been marked as completed.

        :return: a boolean indicating if this instance is blank
        """
        if self.__labels_json is not None and self.__labels_json != []:
            return False
        elif self.__labels is not None and len(self.__labels) == 0:
            return False

        # Labels are empty, but if a task is marked as complete this indicates
        # that the image contains nothing of interest
        if len(self.completed_tasks) > 0:
            return False

        return True

    def with_labels(self, labels: ImageLabels) -> 'WrappedImageLabels':
        """Create a new WrappedLabels instance, replacing the labels

        :param labels: replacement `ImageLabels` instance
        :return: new `WrappedLabels` instance
        """
        return WrappedImageLabels(image_filename=self.image_filename, completed_tasks=self.completed_tasks,
                                  metadata=self.metadata, labels=labels)

    def to_json(self) -> Any:
        js = self.metadata.copy()
        if self.image_filename is not None:
            js['image_filename'] = self.image_filename
        js.update({'completed_tasks': list(self.completed_tasks),
                   'labels': self.labels_json})
        return js

    def write_to_file(self, f: IO):
        """Write labels to file

        :param f: a file-like object, or a path as a `str` or `pathlib.File`
        """
        if isinstance(f, str):
            f = pathlib.Path(f).open('w')
        elif isinstance(f, pathlib.Path):
            f = f.open('w')
        elif isinstance(f, io.IOBase):
            pass
        else:
            raise TypeError('f should be a path as a string or `pathlib.Path` or a file, not a {}'.format(type(f)))
        json.dump(self.to_json(), f)

    @staticmethod
    def from_json(js: Any) -> 'WrappedImageLabels':
        if isinstance(js, dict):
            metadata = js.copy()
            completed_tasks = []
            image_filename = None
            if 'complete' in js:
                # Old-style complete flag; transform to 'finished' task
                del metadata['complete']
                if js['complete']:
                    completed_tasks = ['finished']
                else:
                    completed_tasks = []
            if 'completed_tasks' in js:
                del metadata['completed_tasks']
                completed_tasks = js['completed_tasks']
            if 'image_filename' in js:
                del metadata['image_filename']
                image_filename = js['image_filename']
            del metadata['labels']
            return WrappedImageLabels(image_filename=image_filename, completed_tasks=completed_tasks,
                                      metadata=metadata, labels_json=js['labels'])
        elif isinstance(js, list):
            # No metadata: use defaults
            return WrappedImageLabels(labels_json=js)
        else:
            raise TypeError('Labels loaded from file must either be a dict or a list, '
                            'not a {0}'.format(type(js)))

    @staticmethod
    def from_file(f: IO) -> 'WrappedImageLabels':
        if isinstance(f, str):
            f = pathlib.Path(f)
        if isinstance(f, pathlib.Path):
            file = f.open('r')
        elif isinstance(f, io.IOBase):
            file = f
        else:
            raise TypeError('f should be a path as a string or `pathlib.Path` or a file, not a {}'.format(type(f)))
        js = json.load(file)
        return WrappedImageLabels.from_json(js)


@deprecated(reason='Please use labelled_image.LabelledImage.in_memory()')
def InMemoryLabelledImage(pixels, labels=None, completed_tasks=None):
    from image_labelling_tool.labelled_image import LabelledImage
    return LabelledImage.in_memory(pixels, WrappedImageLabels(labels=labels, completed_tasks=completed_tasks))


@deprecated(reason='Please use labelled_image.LabelledImage.for_image_label_file_pair()')
def PersistentLabelledImage(image_path, labels_path, readonly=False):
    from image_labelling_tool.labelled_image import LabelledImage
    return LabelledImage.for_image_label_file_pair(image_path, labels_path, readonly=readonly)


@deprecated(reason='Please use labelled_image.LabelledImage.for_directory()')
def _PersistentLabelledImage__for_directory(dir_path, image_filename_patterns=None, with_labels_only=False,
                                            labels_dir=None, readonly=False):
    from image_labelling_tool.labelled_image import LabelledImage
    if image_filename_patterns is None:
        image_filename_patterns = ['*.png']
    return LabelledImage.for_directory(dir_path, image_filename_patterns, with_labels_only=with_labels_only,
                                       labels_dir=labels_dir, readonly=readonly)

PersistentLabelledImage.for_directory = _PersistentLabelledImage__for_directory


@deprecated(reason='Please use labelled_image.LabelledImage.for_image_files()')
def _PersistentLabelledImage__for_files(image_paths, with_labels_only=False, labels_dir=None, readonly=False):
    from image_labelling_tool.labelled_image import LabelledImage
    return LabelledImage.for_image_files(image_paths, with_labels_only=with_labels_only,
                                         labels_dir=labels_dir, readonly=readonly)

PersistentLabelledImage.for_files = _PersistentLabelledImage__for_files


@deprecated(reason='Please use the FileImageSource, InMemoryLabelsStore and LabelledImage classes in '
                   'the labelled_image module. Please see the source code of the `LabelledImageFile` '
                   'function in the labelling_tool module to see how.')
def LabelledImageFile(path, labels=None, tasks_complete=None, on_set_labels=None):
    from image_labelling_tool.labelled_image import LabelledImage, FileImageSource, InMemoryLabelsStore

    if on_set_labels is not None:
        # The old callback expects an ImageLabels instance, so wrap it
        def on_update(wrapped_labels):
            on_set_labels(wrapped_labels.labels)
    else:
        on_update = None

    image_source = FileImageSource(path)
    if labels is None:
        labels = ImageLabels([])
    labels_store = InMemoryLabelsStore(WrappedImageLabels(completed_tasks=tasks_complete, labels=labels),
                                       on_update=on_update)

    return LabelledImage(image_source, labels_store)
