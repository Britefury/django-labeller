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


import mimetypes, json, os, glob, io, math, six, traceback, itertools
import copy

import numpy as np

import random

from PIL import Image, ImageDraw

from skimage import img_as_float
from skimage import transform
from skimage.io import imread
from skimage.color import gray2rgb
from skimage.util import pad, img_as_ubyte
from skimage.measure import find_contours

# Try to import cv2
try:
    import cv2
except:
    cv2 = None


class AbstractLabelClass (object):
    def to_json(self):
        raise NotImplementedError('Abstract for type {}'.format(type(self)))

class LabelClass (AbstractLabelClass):
    def __init__(self, name, human_name, colour=None, colours=None):
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


    def to_json(self):
        return {'name': self.name, 'human_name': self.human_name, 'colours': self.colours}


class LabelClassGroup (AbstractLabelClass):
    def __init__(self, human_name, classes):
        """
        Label class group constructor

        :param human_name: human readable name
        :param classes: member classes
        """
        self.group_name = human_name
        self.classes = classes


    def to_json(self):
        return {'group_name': self.group_name, 'group_classes': [cls.to_json() for cls in self.classes]}


def label_class(name, human_name, rgb):
    return {'name': name,
            'human_name': human_name,
            'colour': rgb}

def label_class_group(human_name, classes_json):
    return {'group_name': human_name,
            'group_classes': classes_json}

def image_descriptor(image_id, url=None, width=None, height=None):
    return {'image_id': str(image_id),
            'img_url': str(url) if url is not None else None,
            'width': width,
            'height': height,}


class _AnnoControl (object):
    __control_type__ = None

    def __init__(self, identifier):
        self.identifier = identifier

    def to_json(self):
        return dict(control=self.__control_type__, identifier=self.identifier)


class AnnoControlCheckbox (_AnnoControl):
    __control_type__ = 'checkbox'

    def __init__(self, identifier, label_text):
        super(AnnoControlCheckbox, self).__init__(identifier)
        self.label_text = label_text

    def to_json(self):
        js = super(AnnoControlCheckbox, self).to_json()
        js['label_text'] = self.label_text
        return js


class AnnoControlRadioButtons (_AnnoControl):
    __control_type__ = 'radio'

    def __init__(self, identifier, label_text, choices, label_on_own_line=False):
        super(AnnoControlRadioButtons, self).__init__(identifier)
        self.label_text = label_text
        self.choices = choices
        self.label_on_own_line = label_on_own_line

    def to_json(self):
        js = super(AnnoControlRadioButtons, self).to_json()
        js['label_text'] = self.label_text
        js['choices'] = self.choices
        js['label_on_own_line'] = self.label_on_own_line
        return js

    @classmethod
    def choice(cls, value, label_text, tooltip):
        return dict(value=value, label_text=label_text, tooltip=tooltip)


class AnnoControlPopupMenu (_AnnoControl):
    __control_type__ = 'popup_menu'

    def __init__(self, identifier, label_text, groups):
        super(AnnoControlPopupMenu, self).__init__(identifier)
        self.label_text = label_text
        self.groups = groups

    def to_json(self):
        js = super(AnnoControlPopupMenu, self).to_json()
        js['label_text'] = self.label_text
        js['groups'] = self.groups
        return js

    @classmethod
    def group(cls, label_text, choices):
        return dict(label_text=label_text, choices=choices)

    @classmethod
    def choice(cls, value, label_text, tooltip):
        return dict(value=value, label_text=label_text, tooltip=tooltip)


def _next_wrapped_array(xs):
    return np.append(xs[1:], xs[:1], axis=0)

def _prev_wrapped_array(xs):
    return np.append(xs[-1:], xs[:-1], axis=0)

def _simplify_contour(cs):
    degenerate_verts = (cs == _next_wrapped_array(cs)).all(axis=1)
    while degenerate_verts.any():
        cs = cs[~degenerate_verts,:]
        degenerate_verts = (cs == _next_wrapped_array(cs)).all(axis=1)

    if cs.shape[0] > 0:
        # Degenerate eges
        edges = (_next_wrapped_array(cs) - cs)
        edges = edges / np.sqrt((edges**2).sum(axis=1))[:,None]
        degenerate_edges = (_prev_wrapped_array(edges) * edges).sum(axis=1) > (1.0 - 1.0e-6)
        cs = cs[~degenerate_edges,:]

        if cs.shape[0] > 0:
            return cs
    return None



_LABEL_CLASS_REGISTRY = {}


def label_cls(cls):
    json_label_type = cls.__json_type_name__
    _LABEL_CLASS_REGISTRY[json_label_type] = cls
    return cls



class LabelContext (object):
    def __init__(self, point_radius=0.0):
        self.point_radius = point_radius


class AbstractLabel (object):
    __json_type_name__ = None

    def __init__(self, object_id=None, classification=None, source=None, anno_data=None):
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
    def dependencies(self):
        return []

    def flatten(self):
        yield self

    def fill_label_class_histogram(self, histogram):
        histogram[self.classification] = histogram.get(self.classification, 0) + 1

    def bounding_box(self, ctx=None):
        raise NotImplementedError('Abstract')

    def _warp(self, xform_fn, object_table):
        raise NotImplementedError('Abstract')

    def warped(self, xform_fn, object_table=None):
        if object_table is None:
            object_table = ObjectTable()
        w = self._warp(xform_fn, object_table)
        object_table.register(w)
        return w

    def _render_mask(self, img, fill, dx=0.0, dy=0.0, ctx=None):
        raise NotImplementedError('Abstract')

    def render_mask(self, width, height, fill, dx=0.0, dy=0.0, ctx=None):
        img = Image.new('L', (width, height), 0)
        self._render_mask(img, fill, dx, dy, ctx)
        return np.array(img)

    def to_json(self):
        return dict(label_type=self.__json_type_name__,
                    object_id=self.object_id,
                    label_class=self.classification,
                    source=self.source,
                    anno_data=self.anno_data)

    @classmethod
    def new_instance_from_json(cls, label_json, object_table):
        raise NotImplementedError('Abstract')


    @staticmethod
    def from_json(label_json, object_table):
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

    def __init__(self, position_xy, object_id=None, classification=None, source=None, anno_data=None):
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

    @property
    def dependencies(self):
        return []

    def bounding_box(self, ctx=None):
        point_radius = ctx.point_radius if ctx is not None else 0.0
        return self.position_xy - point_radius, self.position_xy + point_radius

    def _warp(self, xform_fn, object_table):
        warped_pos = xform_fn(self.position_xy[None, :])
        return PointLabel(warped_pos[0, :], self.object_id, self.classification)

    def _render_mask(self, img, fill, dx=0.0, dy=0.0, ctx=None):
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

    def to_json(self):
        js = super(PointLabel, self).to_json()
        js['position'] = dict(x=self.position_xy[0], y=self.position_xy[1])
        return js

    def __str__(self):
        return 'PointLabel(object_id={}, classification={}, position_xy={})'.format(
            self.object_id, self.classification, self.position_xy.tolist()
        )

    @classmethod
    def new_instance_from_json(cls, label_json, object_table):
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

    @property
    def dependencies(self):
        return []

    def bounding_box(self, ctx=None):
        all_verts = np.concatenate(self.regions, axis=0)
        return all_verts.min(axis=0), all_verts.max(axis=0)

    def _warp(self, xform_fn, object_table):
        warped_regions = [xform_fn(region) for region in self.regions]
        return PolygonLabel(warped_regions, self.object_id, self.classification)

    def _render_mask(self, img, fill, dx=0.0, dy=0.0, ctx=None):
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
    def regions_to_json(regions):
        return [[dict(x=float(region[i,0]), y=float(region[i,1])) for i in range(len(region))]
                         for region in regions]

    def to_json(self):
        js = super(PolygonLabel, self).to_json()
        js['regions'] = PolygonLabel.regions_to_json(self.regions)
        return js

    def __str__(self):
        return 'PolygonLabel(object_id={}, classification={}, regions={})'.format(
            self.object_id, self.classification, self.regions
        )

    @classmethod
    def new_instance_from_json(cls, label_json, object_table):
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
    def mask_image_to_regions(mask):
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
                mask_trim = pad(mask_trim, [(1,1), (1,1)], mode='constant').astype(np.float32)
                cs = find_contours(mask_trim, 0.5)
                for contour in cs:
                    simp = _simplify_contour(contour + np.array((ystart, xstart)) - np.array([[1.0, 1.0]]))
                    if simp is not None:
                        contours.append([simp[:, ::-1]])
        return contours


    @staticmethod
    def mask_image_to_regions_cv(mask, sort_decreasing_area=True):
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

    @property
    def dependencies(self):
        return []

    def bounding_box(self, ctx=None):
        return self.centre_xy - self.size_xy, self.centre_xy + self.size_xy

    def _warp(self, xform_fn, object_table):
        corners = np.array([
            self.centre_xy + self.size_xy * -1,
            self.centre_xy + self.size_xy * np.array([1, -1]),
            self.centre_xy + self.size_xy,
            self.centre_xy + self.size_xy * np.array([-1, 1]),
        ])
        xf_corners = xform_fn(corners)
        lower = xf_corners.min(axis=0)
        upper = xf_corners.max(axis=0)
        xf_centre = (lower + upper) * 0.5
        xf_size = upper - lower
        return BoxLabel(xf_centre, xf_size, self.object_id, self.classification)

    def _render_mask(self, img, fill, dx=0.0, dy=0.0, ctx=None):
        # Rendering helper function: create a binary mask for a given label

        centre = self.centre_xy + np.array([dx, dy])
        lower = centre - self.size_xy * 0.5
        upper = centre + self.size_xy * 0.5

        if fill:
            ImageDraw.Draw(img).rectangle([lower, upper], outline=1, fill=1)
        else:
            ImageDraw.Draw(img).rectangle([lower, upper], outline=1, fill=0)

    def to_json(self):
        js = super(BoxLabel, self).to_json()
        js['centre'] = dict(x=self.centre_xy[0], y=self.centre_xy[1])
        js['size'] = dict(x=self.size_xy[0], y=self.size_xy[1])
        return js

    def __str__(self):
        return 'BoxLabel(object_id={}, classification={}, centre_xy={}, size_xy={})'.format(
            self.object_id, self.classification, self.centre_xy.tolist(), self.size_xy.tolist()
        )

    @classmethod
    def new_instance_from_json(cls, label_json, object_table):
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
    def dependencies(self):
        return self.components

    def bounding_box(self, ctx=None):
        return None, None

    def _warp(self, xform_fn, object_table):
        warped_components = []
        for comp in self.components:
            if comp.object_id in object_table:
                warped_comp = object_table[comp.object_id]
            else:
                warped_comp = comp.warped(xform_fn, object_table)
            warped_components.append(warped_comp)
        return CompositeLabel(warped_components, self.object_id, self.classification)

    def render_mask(self, width, height, fill, dx=0.0, dy=0.0, ctx=None):
        return None

    def to_json(self):
        js = super(CompositeLabel, self).to_json()
        js['components'] = [component.object_id for component in self.components]
        return js

    def __str__(self):
        return 'CompositeLabel(object_id={}, classification={}, ids(components)={}'.format(
            self.object_id, self.classification, [c.object_id for c in self.components]
        )

    @classmethod
    def new_instance_from_json(cls, label_json, object_table):
        components = [object_table.get(obj_id) for obj_id in label_json['components']]
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

    def flatten(self):
        for comp in self.component_labels:
            for f in comp.flatten():
                yield f
        yield self

    def bounding_box(self, ctx=None):
        lowers, uppers = list(zip(*[comp.bounding_box(ctx) for comp in self.component_labels]))
        lowers = [x for x in lowers if x is not None]
        uppers = [x for x in uppers if x is not None]
        if len(lowers) > 0 and len(uppers) > 0:
            return np.array(lowers).min(axis=0), np.array(uppers).max(axis=0)
        else:
            return None, None

    def _warp(self, xform_fn, object_table):
        comps = [comp.warped(xform_fn, object_table) for comp in self.component_labels]
        return GroupLabel(comps, self.object_id, self.classification)

    def _render_mask(self, img, fill, dx=0.0, dy=0.0, ctx=None):
        for label in self.component_labels:
            label._render_mask(img, fill, dx, dy, ctx)

    def to_json(self):
        js = super(GroupLabel, self).to_json()
        js['component_models'] = [component.to_json() for component in self.component_labels]
        return js

    def __str__(self):
        return 'GroupLabel(object_id={}, classification={}, component_labels={}'.format(
            self.object_id, self.classification, self.component_labels
        )

    @classmethod
    def new_instance_from_json(cls, label_json, object_table):
        components = [AbstractLabel.from_json(comp, object_table)
                      for comp in label_json['component_models']]
        return GroupLabel(components, label_json.get('object_id'),
                          classification=label_json['label_class'],
                          source=label_json.get('source'),
                          anno_data=label_json.get('anno_data'))



class ObjectTable (object):
    def __init__(self, objects=None):
        self._object_id_to_obj = {}
        self._next_object_id = 1

        if objects is not None:
            # Register objects with object IDs
            for obj in objects:
                self.register(obj)

            # Allocate object IDs to objects with no ID
            self._alloc_object_ids(objects)

    def _alloc_object_ids(self, objects):
        for obj in objects:
            if obj.object_id is None:
                self._alloc_id(obj)

    def _alloc_id(self, obj):
        obj_id = self._next_object_id
        self._next_object_id += 1
        obj.object_id = obj_id
        self._object_id_to_obj[obj_id] = obj
        return obj_id

    def register(self, obj):
        obj_id = obj.object_id
        if obj_id is not None:
            if obj_id in self._object_id_to_obj:
                raise ValueError('Duplicate object ID')
            self._object_id_to_obj[obj_id] = obj
            self._next_object_id = max(self._next_object_id, obj_id + 1)

    def __getitem__(self, obj_id):
        if obj_id is None:
            return None
        else:
            return self._object_id_to_obj[obj_id]

    def get(self, obj_id, default=None):
        if obj_id is None:
            return None
        else:
            return self._object_id_to_obj.get(obj_id, default)

    def __contains__(self, obj_id):
        return obj_id in self._object_id_to_obj


class ImageLabels (object):
    """
    Represents labels in vector format, stored in JSON form. Has methods for
    manipulating and rendering them.

    """
    def __init__(self, labels, obj_table=None):
        self.labels = labels
        if obj_table is None:
            obj_table = ObjectTable(list(self.flatten()))
        self._obj_table = obj_table


    def __len__(self):
        return len(self.labels)

    def __getitem__(self, item):
        return self.labels[item]


    def flatten(self):
        for lab in self.labels:
            for f in lab.flatten():
                yield f


    def label_class_histogram(self):
        histogram = {}
        for lab in self.labels:
            lab.fill_label_class_histogram(histogram)
        return histogram


    def retain(self, indices):
        """
        Create a clone of the labels listed in `indices`

        :param indices: A list of indices that lists the labels that are to be returned
        :return: `ImageLabels` instance
        """
        retained_labels = copy.deepcopy([self.labels[i] for i in indices])
        return ImageLabels(retained_labels)


    def warp(self, xform_fn):
        """
        Warp the labels given a warping function

        :param xform_fn: a transformation function of the form `f(vertices) -> warped_vertices`, where `vertices` and
        `warped_vertices` are both Numpy arrays of shape `(N,2)` where `N` is the number of vertices and the
        co-ordinates are `x,y` pairs. The transformations defined in `skimage.transform`, e.g. `AffineTransform` can
        be used here.
        :return: an `ImageLabels` instance that contains the warped labels
        """
        warped_obj_table = ObjectTable()
        warped_labels = [lab.warped(xform_fn, warped_obj_table) for lab in self.labels]
        return ImageLabels(warped_labels, obj_table=warped_obj_table)


    @staticmethod
    def _label_class_list_to_mapping(label_classes, start_at=0):
        """
        Coerce label_classes to a mapping.

        If it is a dict, leave it as is.

        If it is a list, map class names to indices as per `render_label_classes` and `render_label_instances`.

        :param label_classes:
        :param start_at: Label offset
        :return: `(cls_to_name, n_classes)`
        """
        if isinstance(label_classes, dict):
            return label_classes, max(label_classes.values()) + 1
        elif isinstance(label_classes, list) or isinstance(label_classes, tuple):
            cls_to_index = {}
            for i, cls in enumerate(label_classes):
                if isinstance(cls, LabelClass):
                    cls_to_index[cls.name] = i + start_at
                elif isinstance(cls, six.string_types)  or  cls is None:
                    cls_to_index[cls] = i + start_at
                elif isinstance(cls, list)  or  isinstance(cls, tuple):
                    for c in cls:
                        if isinstance(c, LabelClass):
                            cls_to_index[c.name] = i + start_at
                        elif isinstance(c, six.string_types)  or  c is None:
                            cls_to_index[c] = i + start_at
                        else:
                            raise TypeError('Item {0} in label_classes is a list that contains an item that is not a '
                                            'LabelClass or a string but a {1}'.format(i, type(c).__name__))
                else:
                    raise TypeError('Item {0} in label_classes is not a LabelClass, string or list, '
                                    'but a {1}'.format(i, type(cls).__name__))
            return cls_to_index, len(label_classes)
        else:
            raise TypeError('label_classes must be a dict or a sequence. The sequence can contain LabelClass '
                            'instances, strings or nested sequences of the former')


    def render_label_classes(self, label_classes, image_shape, multichannel_mask=False, fill=True, ctx=None):
        """
        Render label classes to a create a label class image suitable for use as a
        semantic segmentation ground truth image.

        :param label_classes: either a dict mapping class name to class index or a sequence of classes.
            If a dictionary is used, note that the background of a non-multichannel image will be filled with 0,
            so avoid using values of zero.
            If a sequence of classes is used, an item that is a list or tuple will cause the classes contained
            within the item to be mapped to the same label index. Each class should be a string giving the class name
            or a `LabelClass` instance. Labels whose class are not present `label_classes` are ignored.
            E.g. [['tree', 'grass'], ['building']] will render labels of class 'tree' or 'grass' with the value 1
            and labels of class 'building' with the value 2
        :param image_shape: `(height, width)` tuple specifying the shape of the image to be returned
        :param multichannel_mask: If `False`, return an (height, width) array of dtype=int with zero indicating
            background and non-zero values giving `1 + class_index` where `class_index` is the index of the labels
            class as it appears in `label_classes. If True, return a (height, width, n_classes) array of dtype=bool
            that is a stack of per-channel masks where each mask indicates coverage by one or more labels of that class.
            Classes are specified in `label_classes`.
        :param fill: if True, labels will be filled, otherwise they will be outlined
        :return: (H,W) array with dtype=int if multichannel is False, otherwise (H,W,n_classes) with dtype=bool
        """
        cls_to_index, n_classes = self._label_class_list_to_mapping(label_classes, 0 if multichannel_mask else 1)

        height, width = image_shape

        if multichannel_mask:
            label_image = np.zeros((height, width, n_classes), dtype=bool)
        else:
            label_image = np.zeros((height, width), dtype=int)

        for label in self.labels:
            label_cls_n = cls_to_index.get(label.classification, None)
            if label_cls_n is not None:
                mask = label.render_mask(width, height, fill, ctx=ctx)
                if mask is not None:
                    mask = mask >= 0.5
                    if multichannel_mask:
                        label_image[:,:,label_cls_n] |= mask
                    else:
                        label_image[mask] = label_cls_n

        return label_image


    def render_label_instances(self, label_classes, image_shape, multichannel_mask=False,
                               fill=True, ctx=None):
        """
        Render a label instance image suitable for use as an instance segmentation ground truth image.

        To get a stack of masks with one mask per object/label, give `multichannel_mask` a value of True

        :param label_classes: either a dict mapping class name to class index or a sequence of classes.
            If a dictionary is used, note that the background of a non-multichannel image will be filled with 0.
            If a sequence of classes is used, an item that is a list or tuple will cause the classes contained
            within the item to be mapped to the same label index. Each class should be a string giving the class name
            or a `LabelClass` instance. Labels whose class are not present `label_classes` are ignored.
            E.g. [['tree', 'grass'], ['building']] will render labels of class 'tree' or 'grass' with the value 1
            and labels of class 'building' with the value 2
        :param image_shape: `(height, width)` tuple specifying the shape of the image to be returned
        :param multichannel_mask: If `False`, return an (height, width) array of dtype=int with zero indicating
            background and non-zero values giving `1 + label_index` where `label_index` is the index of the label
            is they are ordered. If True, return a (height, width, n_labels) array of dtype=bool that is a stack
            of masks, with one mask corresponding to each label.
        :param fill: if True, labels will be filled, otherwise they will be outlined
        :param image_shape: `None`, or a `(height, width)` tuple specifying the shape of the image to be rendered
        :return: tuple of (label_image, label_index_to_cls) where:
            label_image is a (H,W) array with dtype=int
            label_index_to_cls is a 1D array that gives the class index of each labels. If `multichannel_mask` is
                False, the first entry at index 0 will have a value of 0 as it is the background label.
                The class indices are the index of the class in `label_class` + 1. Otherwise
        """
        cls_to_index, _ = self._label_class_list_to_mapping(label_classes, 1)

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
        else:
            label_i = 1
            label_index_to_cls = [0]
        for label in self.labels:
            label_cls = cls_to_index.get(label.classification, None)
            if label_cls is not None:
                mask = label.render_mask(width, height, fill, ctx=ctx)
                if mask is not None:
                    mask = mask >= 0.5
                    if multichannel_mask:
                        label_image_stack.append(mask)
                    else:
                        label_image[mask] = label_i
                    label_index_to_cls.append(label_cls)
                    label_i += 1

        if label_image_stack:
            label_image = np.stack(label_image_stack, axis=2)

        return label_image, np.array(label_index_to_cls)


    def extract_label_images(self, image_2d, label_class_set=None, ctx=None):
        """
        Extract an image of each labelled entity from a given image.
        The resulting image is the original image masked with an alpha channel that results from rendering the label

        :param image_2d: the image from which to extract images of labelled objects
        :param label_class_set: a sequence of classes whose labels should be rendered, or None for all labels
        :return: a list of (H,W,C) image arrays
        """
        image_shape = image_2d.shape[:2]

        label_images = []

        for label in self.labels:
            if label_class_set is None  or  label.classification in label_class_set:
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
                            object_img = np.append(img_box, mask[:,:,None], axis=2)

                            label_images.append(object_img)

        return label_images


    def to_json(self):
        return [lab.to_json() for lab in self.labels]

    def replace_json(self, existing_json):
        if isinstance(existing_json, dict):
            new_dict = {}
            new_dict.update(existing_json)
            new_dict['labels'] = self.to_json()
            return new_dict
        elif isinstance(existing_json, list):
            return self.to_json()
        else:
            raise ValueError('existing_json should be a list or a dict')


    def wrapped_json(self, image_filename, complete):
        return {'image_filename': image_filename,
                'complete': complete,
                'labels': self.to_json()}


    @classmethod
    def merge(cls, *image_labels):
        """
        Merge multiple `ImageLabel` label collections.

        :param image_labels: `ImageLabel` instances to merge
        :return: `ImageLabels` instance
        """
        merged_labels = []
        for il in image_labels:
            merged_labels.extend(copy.deepcopy(il.labels))
        for label in merged_labels:
            for f_label in label.flatten():
                f_label.object_id = None
        return ImageLabels(merged_labels)


    @staticmethod
    def from_json(label_data_js):
        """
        Labels in JSON format

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

        obj_table = ObjectTable()
        labs = [AbstractLabel.from_json(label, obj_table) for label in labels]
        return ImageLabels(labs, obj_table=obj_table)


    @staticmethod
    def from_file(f):
        if isinstance(f, six.string_types):
            f = open(f, 'r')
        elif isinstance(f, io.IOBase):
            pass
        else:
            raise TypeError('f should be a path as a string or a file')
        return ImageLabels.from_json(json.load(f))



    @classmethod
    def from_contours(cls, label_contours, label_classes=None, sources=None):
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
        obj_table = ObjectTable()
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
    def _get_label_meta(meta, label_i):
        """
        Get label metadata from a metadata mapping:
        - if `meta` is None, will return `None`
        - if `meta` is a str, will return `meta`
        - if `meta` is a dict, will return `meta.get(label_i)`
        - if `meta` is a list, will return `meta[label_i]`

        :param meta: metadata mapping
        :param label_i: label index
        :return: label metadatga
        """
        if meta is None or isinstance(meta, str):
            return meta
        elif isinstance(meta, dict):
            return meta.get(label_i)
        elif isinstance(meta, list):
            return meta[label_i]
        else:
            raise TypeError('should be None, str, dict or list, not a {}'.format(type(meta)))

    @classmethod
    def from_label_image(cls, labels, label_classes=None, sources=None):
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
        :return: an `ImageLabels` instance containing the labels extracted from the label mask image
        """
        if label_classes is not None and not isinstance(label_classes, (str, dict, list)):
            raise TypeError('label_classes should be None, a str, a dict or a list, not {}'.format(type(label_classes)))
        if sources is not None and not isinstance(sources, (str, dict, list)):
            raise TypeError('sources should be None, a str, a dict or a list, not {}'.format(type(sources)))
        contours = []
        lcls = []
        lsrc = []
        for i in range(1, labels.max()+1):
            lmask = labels == i

            if lmask.sum() > 0:
                mask_positions = np.argwhere(lmask)
                (ystart, xstart), (ystop, xstop) = mask_positions.min(0), mask_positions.max(0) + 1

                if ystop >= ystart+1 and xstop >= xstart+1:
                    mask_trim = lmask[ystart:ystop, xstart:xstop]
                    mask_trim = pad(mask_trim, [(1,1), (1,1)], mode='constant').astype(np.float32)
                    cs = find_contours(mask_trim, 0.5)
                    regions = []
                    for contour in cs:
                        simp = _simplify_contour(contour + np.array((ystart, xstart)) - np.array([[1.0, 1.0]]))
                        if simp is not None:
                            regions.append([simp])
                    contours.append(regions)
                    lcls.append(cls._get_label_meta(label_classes, i))
                    lsrc.append(cls._get_label_meta(sources, i))

        return cls.from_contours(contours, lcls, lsrc)


    @staticmethod
    def _contour_areas(contours):
        contour_areas = []
        for contour in contours:
            # Vectors from vertex 0 to all others
            u = contour[1:, :] - contour[0:1, :]
            contour_area = np.cross(u[:-1, :], u[1:, :]).sum() / 2
            contour_area = abs(float(contour_area))
            contour_areas.append(contour_area)
        return np.array(contour_areas)

    @classmethod
    def from_mask_images_cv(cls, masks, label_classes=None, sources=None, sort_decreasing_area=True):
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
        :return: an `ImageLabels` instance
        """
        if cv2 is None:
            raise RuntimeError('OpenCV is not available!')
        if label_classes is not None and not isinstance(label_classes, (str, dict, list)):
            raise TypeError('label_classes should be Nonr or a str, dict or list, not a {}'.format(type(label_classes)))
        if sources is not None and not isinstance(sources, (str, dict, list)):
            raise TypeError('sources should be Nonr or a str, dict or list, not a {}'.format(type(sources)))

        mask_areas = []
        contours_classes_sources = []
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

                contours_classes_sources.append((region_contours,
                                                 cls._get_label_meta(label_classes, mask_i),
                                                 cls._get_label_meta(sources, mask_i)))
        mask_areas = np.array(mask_areas)

        if sort_decreasing_area and len(contours_classes_sources) > 0:
            order = np.argsort(mask_areas)[::-1]
            contours_classes_sources = [contours_classes_sources[i] for i in order]

        if len(contours_classes_sources) > 0:
            image_contours, lcls, lsrc = list(zip(*contours_classes_sources))
            return cls.from_contours(image_contours, lcls, lsrc)
        else:
            return cls.from_contours([])




class AbsractLabelledImage (object):
    def __init__(self):
        pass


    def read_pixels(self):
        raise NotImplementedError('Abstract for type {}'.format(type(self)))

    @property
    def pixels(self):
        raise NotImplementedError('Abstract for type {}'.format(type(self)))

    @property
    def image_size(self):
        raise NotImplementedError('Abstract for type {}'.format(type(self)))

    def data_and_mime_type_and_size(self):
        raise NotImplementedError('Abstract for type {}'.format(type(self)))


    @property
    def labels(self):
        raise NotImplementedError('Abstract for type {}'.format(type(self)))

    @labels.setter
    def labels(self, l):
        raise NotImplementedError('Abstract for type {}'.format(type(self)))

    def has_labels(self):
        raise NotImplementedError('Abstract for type {}'.format(type(self)))

    @property
    def labels_json(self):
        raise NotImplementedError('Abstract for type {}'.format(type(self)))

    @labels_json.setter
    def labels_json(self, l):
        raise NotImplementedError('Abstract for type {}'.format(type(self)))


    @property
    def complete(self):
        raise NotImplementedError('Abstract for type {}'.format(type(self)))

    @complete.setter
    def complete(self, c):
        raise NotImplementedError('Abstract for type {}'.format(type(self)))


    def get_label_data_for_tool(self):
        return self.labels_json, self.complete

    def set_label_data_from_tool(self, labels_js, complete):
        self.complete = complete
        self.labels_json = labels_js


    def label_class_histogram(self):
        return self.labels.label_class_histogram()


    def warped(self, projection, sz_px):
        warped_pixels = transform.warp(self.pixels, projection.inverse)[:int(sz_px[0]),:int(sz_px[1])].astype('float32')
        warped_labels = self.labels._warp(projection)
        return InMemoryLabelledImage(warped_pixels, warped_labels)


    def render_label_classes(self, label_classes, multichannel_mask=False, fill=True):
        """
        Render label classes to a create a label class image suitable for use as a
        semantic segmentation ground truth image.

        :param label_classes: either a dict mapping class name to class index or a sequence of classes.
            If a sequence of classes is used, an item that is a list or tuple will cause the classes contained
            within the item to be mapped to the same label index. Each class should be a string giving the class name
            or a `LabelClass` instance. Labels whose class are not present in this list are ignored.
        :param multichannel_mask: If `False`, return an (height, width) array of dtype=int with zero indicating
            background and non-zero values giving `1 + class_index` where `class_index` is the index of the labels
            class as it appears in `label_classes. If True, return a (height, width, n_classes) array of dtype=bool
            that is a stack of per-channel masks where each mask indicates coverage by one or more labels of that class.
            Classes are specified in `label_classes`.
        :param fill: if True, labels will be filled, otherwise they will be outlined
        :return: (H,W) array with dtype=int if multichannel is False, otherwise (H,W,n_classes) with dtype=bool
        """
        return self.labels.render_label_classes(label_classes, self.image_size,
                                                multichannel_mask=multichannel_mask, fill=fill)


    def render_label_instances(self, label_classes, multichannel_mask=False, fill=True):
        """
        Render a label instance image suitable for use as an instance segmentation ground truth image.

        To get a stack of masks with one mask per object/label, give `multichannel_mask` a value of True

        :param label_classes: either a dict mapping class name to class index or a sequence of classes.
            If a sequence of classes is used, an item that is a list or tuple will cause the classes contained
            within the item to be mapped to the same label index. Each class should be a string giving the class name
            or a `LabelClass` instance. Labels whose class are not present in this list are ignored.
        :param multichannel_mask: If `False`, return an (height, width) array of dtype=int with zero indicating
            background and non-zero values giving `1 + label_index` where `label_index` is the index of the label
            is they are ordered. If True, return a (height, width, n_labels) array of dtype=bool that is a stack
            of masks, with one mask corresponding to each label.
        :param fill: if True, labels will be filled, otherwise they will be outlined
        :return: tuple of (label_image, label_index_to_cls) where:
            label_image is a (H,W) array with dtype=int
            label_index_to_cls is a 1D array that gives the class index of each labels. The first entry
                at index 0 will have a value of 0 as it is the background label. The class indices are the
                index of the class in `label_class` + 1.
        """
        return self.labels.render_label_instances(label_classes, self.image_size, multichannel_mask=multichannel_mask,
                                                  fill=fill)


    def extract_label_images(self, label_class_set=None):
        """
        Extract an image of each labelled entity.
        The resulting image is the original image masked with an alpha channel that results from rendering the label

        :param label_class_set: a sequence of classes whose labels should be rendered, or None for all labels
        :return: a list of (H,W,C) image arrays
        """
        return self.labels.extract_label_images(self.pixels, label_class_set=label_class_set)



class InMemoryLabelledImage (AbsractLabelledImage):
    def __init__(self, pixels, labels=None, complete=False):
        super(InMemoryLabelledImage, self).__init__()
        if labels is None:
            labels = ImageLabels([])
        self.__pixels = pixels
        self.__labels = labels
        self.__complete = complete


    def read_pixels(self):
        return self.__pixels

    @property
    def pixels(self):
        return self.__pixels

    @property
    def image_size(self):
        return self.__pixels.shape[:2]

    def data_and_mime_type_and_size(self):
        buf = io.BytesIO()
        pix_u8 = img_as_ubyte(self.__pixels)
        img = Image.fromarray(pix_u8)
        img.save(buf, format='png')
        return buf.getvalue(), 'image/png', int(self.__pixels.shape[1]), int(self.__pixels.shape[0])



    @property
    def labels(self):
        return self.__labels

    @labels.setter
    def labels(self, l):
        self.__labels = l

    def has_labels(self):
        return True

    @property
    def labels_json(self):
        return self.__labels.to_json()

    @labels_json.setter
    def labels_json(self, l):
        self.__labels = ImageLabels.from_json(l)


    @property
    def complete(self):
        return self.__complete

    @complete.setter
    def complete(self, c):
        self.__complete = c


class PersistentLabelledImage (AbsractLabelledImage):
    def __init__(self, image_path, labels_path, readonly=False):
        super(PersistentLabelledImage, self).__init__()
        self.__image_path = image_path
        self.__labels_path = labels_path
        self.__pixels = None

        self.__labels_json = None
        self.__complete = None
        self.__readonly = readonly

    def read_pixels(self):
        return img_as_float(imread(self.__image_path))

    @property
    def pixels(self):
        if self.__pixels is None:
            self.__pixels = self.read_pixels()
        return self.__pixels

    @property
    def image_size(self):
        if self.__pixels is not None:
            return self.__pixels.shape[:2]
        else:
            i = Image.open(self.__image_path)
            return i.size[1], i.size[0]

    def data_and_mime_type_and_size(self):
        if os.path.exists(self.__image_path):
            with open(self.__image_path, 'rb') as img:
                shape = self.image_size
                return img.read(), mimetypes.guess_type(self.__image_path)[0], int(shape[1]), int(shape[0])


    @property
    def image_path(self):
        return self.__image_path

    @property
    def image_filename(self):
        return os.path.basename(self.__image_path)

    @property
    def image_name(self):
        return os.path.splitext(self.image_filename)[0]



    @property
    def labels(self):
        return ImageLabels.from_json(self.labels_json)

    @labels.setter
    def labels(self, l):
        self.labels_json = l.to_json()


    @property
    def labels_json(self):
        labels_js, complete = self._get_labels()
        return labels_js

    @labels_json.setter
    def labels_json(self, labels_json):
        self._set_labels(labels_json, self.__complete)


    @property
    def complete(self):
        labels_js, complete = self._get_labels()
        return complete

    @complete.setter
    def complete(self, c):
        self._set_labels(self.__labels_json, c)


    def has_labels(self):
        return os.path.exists(self.__labels_path)


    def get_label_data_for_tool(self):
        return self._get_labels()

    def set_label_data_from_tool(self, labels_js, complete):
        self._set_labels(labels_js, complete)



    def _get_labels(self):
        if self.__labels_json is None:
            if os.path.exists(self.__labels_path):
                with open(self.__labels_path, 'r') as f:
                    try:
                        js = json.load(f)
                        self.__labels_json, self.__complete = self._unwrap_labels(js)
                    except ValueError:
                        traceback.print_exc()
                        pass
        return self.__labels_json, self.__complete


    def _set_labels(self, labels_js, complete):
        if not self.__readonly:
            if labels_js is None  or  (len(labels_js) == 0 and not complete):
                # No data; delete the file
                if os.path.exists(self.__labels_path):
                    os.remove(self.__labels_path)
            else:
                with open(self.__labels_path, 'w') as f:
                    wrapped = self.__wrap_labels(os.path.split(self.image_path)[1], labels_js, complete)
                    json.dump(wrapped, f, indent=3)
        self.__labels_json = labels_js
        self.__complete = complete




    @staticmethod
    def __wrap_labels(image_path, labels, complete):
        image_filename = os.path.split(image_path)[1]
        return {'image_filename': image_filename,
                'complete': complete,
                'labels': labels}

    @staticmethod
    def _unwrap_labels(wrapped_labels):
        if isinstance(wrapped_labels, dict):
            return wrapped_labels['labels'], wrapped_labels.get('complete', False)
        elif isinstance(wrapped_labels, list):
            return wrapped_labels, False
        else:
            raise TypeError('Labels loaded from file must either be a dict or a list, '
                            'not a {0}'.format(type(wrapped_labels)))


    @staticmethod
    def __compute_labels_path(path, labels_dir=None):
        p = os.path.splitext(path)[0] + '__labels.json'
        if labels_dir is not None:
            p = os.path.join(labels_dir, os.path.split(p)[1])
        return p


    @classmethod
    def for_directory(cls, dir_path, image_filename_patterns=['*.png'], with_labels_only=False,
                      labels_dir=None, readonly=False):
        image_paths = []
        for pat in image_filename_patterns:
            image_paths.extend(glob.glob(os.path.join(dir_path, pat)))
        return cls.for_files(image_paths, with_labels_only=with_labels_only, labels_dir=labels_dir,
                             readonly=readonly)

    @classmethod
    def for_files(cls, image_paths, with_labels_only=False, labels_dir=None, readonly=False):
        limgs = []
        for img_path in image_paths:
            labels_path = cls.__compute_labels_path(img_path, labels_dir=labels_dir)
            if not with_labels_only or os.path.exists(labels_path):
                limgs.append(PersistentLabelledImage(img_path, labels_path, readonly=readonly))
        return limgs


class LabelledImageFile (AbsractLabelledImage):
    def __init__(self, path, labels=None, complete=False, on_set_labels=None):
        super(LabelledImageFile, self).__init__()
        if labels is None:
            labels = ImageLabels([])
        self.__labels = labels
        self.__complete = complete
        self.__image_path = path
        self.__pixels = None
        self.__on_set_labels = on_set_labels



    def read_pixels(self):
        return img_as_float(imread(self.__image_path))

    @property
    def pixels(self):
        if self.__pixels is None:
            self.__pixels = self.read_pixels()
        return self.__pixels

    @property
    def image_size(self):
        if self.__pixels is not None:
            return self.__pixels.shape[:2]
        else:
            i = Image.open(self.__image_path)
            return i.size[1], i.size[0]

    def data_and_mime_type_and_size(self):
        if os.path.exists(self.__image_path):
            with open(self.__image_path, 'rb') as img:
                shape = self.image_size
                return img.read(), mimetypes.guess_type(self.__image_path)[0], int(shape[1]), int(shape[0])


    @property
    def image_path(self):
        return self.__image_path

    @property
    def image_filename(self):
        return os.path.basename(self.__image_path)

    @property
    def image_name(self):
        return os.path.splitext(self.image_filename)[0]



    @property
    def labels(self):
        return self.__labels

    @labels.setter
    def labels(self, l):
        self.__labels = l
        if self.__on_set_labels is not None:
            self.__on_set_labels(self.__labels)


    def has_labels(self):
        return True


    @property
    def labels_json(self):
        return self.__labels.to_json()

    @labels_json.setter
    def labels_json(self, l):
        self.__labels = ImageLabels.from_json(l)
        if self.__on_set_labels is not None:
            self.__on_set_labels(self.__labels)


    @property
    def complete(self):
        return self.__complete

    @complete.setter
    def complete(self, c):
        self.__complete = c



def shuffle_images_without_labels(labelled_images):
    with_labels = [img   for img in labelled_images   if img.has_labels()]
    without_labels = [img   for img in labelled_images   if not img.has_labels()]
    random.shuffle(without_labels)
    return with_labels + without_labels

