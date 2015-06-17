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


import mimetypes, json, os, glob, copy, io, math

import numpy as np

import random

from PIL import Image, ImageDraw

from skimage import img_as_float
from skimage import transform
from skimage.io import imread, imsave
from skimage.color import gray2rgb



class LabelClass (object):
    def __init__(self, name, human_name, colour):
        """
        Label class constructor
        
        :param name: identifier class name 
        :param human_name: human readable name
        :param colour: colour as a tuple or list e.g. [255, 0, 0] for red
        """
        self.name = name
        self.human_name = human_name
        colour = list(colour)
        if len(colour) != 3:
            raise TypeError, 'colour must be a tuple or list of length 3'
        self.colour = colour


    def to_json(self):
        return {'name': self.name, 'human_name': self.human_name, 'colour': self.colour}


def label_class(name, human_name, rgb):
    return {'name': name,
            'human_name': human_name,
            'colour': rgb}



class AbsractLabelledImage (object):
    def __init__(self):
        pass


    @property
    def pixels(self):
        raise NotImplementedError

    @property
    def image_shape(self):
        return self.pixels.shape[:2]

    def data_and_mime_type_and_size(self):
        raise NotImplementedError


    @property
    def labels(self):
        raise NotImplementedError

    @labels.setter
    def labels(self, l):
        raise NotImplementedError

    def has_labels(self):
        raise NotImplementedError


    def transformed_labels(self, xform_fn):
        labels = copy.deepcopy(self.labels)
        for label in labels:
            label_type = label['label_type']
            if label_type == 'polygon':
                # Polygonal label
                vertices = label['vertices']
                polygon = [[v['x'], v['y']]  for v in vertices]
                polygon = xform_fn(polygon)
                transformed_verts = [{'x': polygon[i,0], 'y': polygon[i,1]}   for i in xrange(len(polygon))]
                label['vertices'] = transformed_verts
            elif label_type == 'composite':
                # Nothing to do
                pass
            else:
                raise TypeError, 'Unknown label type {0}'.format(label_type)
        return labels


    def warped(self, projection, sz_px):
        warped_pixels = transform.warp(self.pixels, projection.inverse)[:int(sz_px[0]),:int(sz_px[1])].astype('float32')
        warped_labels = self.transformed_labels(projection)
        return InMemoryLabelledImage(warped_pixels, warped_labels)



    def render_labels(self, label_classes, pixels_as_vectors=False, fill=True):
        """
        Render the labels to create a label image

        :param label_classes: a sequence of classes. If an item is a list or tuple, the classes contained
            within are mapped to the same label index.
            Each class should be a `LabelClass` instance, a string.
        :param pixels_as_vectors: If `False`, return an (height,width) array of dtype=int with pixels numbered
            according to their label. If `True`, return a (height,width,n_labels) array of dtype=float32 with each pixel
            being a feature vector that gives the weight of each label, where n_labels is `len(label_classes)`
        :param fill: if True, labels will be filled, otherwise they will be outlined
        :return: (H,W) array with dtype=int if pixels_as_vectors is False, otherwise (H,W,n_labels) with dtype=float32
        """
        if isinstance(label_classes, list) or isinstance(label_classes, tuple):
            cls_to_index = {}
            for i, cls in enumerate(label_classes):
                if isinstance(cls, LabelClass):
                    cls_to_index[cls.name] = i
                elif isinstance(cls, str)  or  isinstance(cls, unicode)  or  cls is None:
                    cls_to_index[cls] = i
                elif isinstance(cls, list)  or  isinstance(cls, tuple):
                    for c in cls:
                        if isinstance(c, LabelClass):
                            cls_to_index[c.name] = i
                        elif isinstance(c, str)  or  isinstance(c, unicode)  or  c is None:
                            cls_to_index[c] = i
                        else:
                            raise TypeError, 'Item {0} in label_classes is a list that contains an item that is not a LabelClass or a string but a {1}'.format(i, type(c).__name__)
                else:
                    raise TypeError, 'Item {0} in label_classes is not a LabelClass, string or list, but a {1}'.format(i, type(cls).__name__)
        else:
            raise TypeError, 'label_classes must be a sequence that can contain LabelClass instances, strings or sub-sequences of the former'


        height, width = self.image_shape

        if pixels_as_vectors:
            label_image = np.zeros((height, width, len(label_classes)), dtype='float32')
        else:
            label_image = np.zeros((height, width), dtype=int)

        for label in self.labels:
            label_type = label['label_type']
            label_cls_n = cls_to_index.get(label['label_class'], None)
            if label_cls_n is not None:
                if label_type == 'polygon':
                    # Polygonal label
                    vertices = label['vertices']
                    if len(vertices) >= 3:
                        polygon = [(v['x'], v['y'])  for v in vertices]

                        img = Image.new('L', (width, height), 0)
                        if fill:
                            ImageDraw.Draw(img).polygon(polygon, outline=1, fill=1)
                        else:
                            ImageDraw.Draw(img).polygon(polygon, outline=1, fill=0)
                        mask = np.array(img)

                        if pixels_as_vectors:
                            label_image[:,:,label_cls_n] += mask
                            label_image[:,:,label_cls_n] = np.clip(label_image[:,:,label_cls_n], 0.0, 1.0)
                        else:
                            label_image[mask >= 0.5] = label_cls_n + 1

                elif label_type == 'composite':
                    pass
                else:
                    raise TypeError, 'Unknown label type {0}'.format(label_type)

        return label_image


    def render_individual_labels(self, label_classes, fill=True):
        """
        Render individual labels to create a label image.
        The resulting image is a multi-channel image, with a channel for each class in `label_classes`.
        Each individual label's class is used to select the channel that it is rendered into.
        Each label is given a different index that is rendered into the resulting image.

        :param label_classes: a sequence of classes. If an item is a list or tuple, the classes contained
            within are mapped to the same label index.
            Each class should be a `LabelClass` instance, a string.
            Each entry within label_classes will have a corresponding channel in the output image
        :param fill: if True, labels will be filled, otherwise they will be outlined
        :return: tuple of (label_image, label_counts) where:
            label_image is a (H,W,C) array with dtype=int
            label_counts is a 1D array of length C (number of channels) that contains the number of labels drawn for each channel; effectively the maximum value found in each channel
        """
        # Create `cls_to_channel`
        if isinstance(label_classes, list) or isinstance(label_classes, tuple):
            cls_to_channel = {}
            for i, cls in enumerate(label_classes):
                if isinstance(cls, LabelClass):
                    cls_to_channel[cls.name] = i
                elif isinstance(cls, str)  or  isinstance(cls, unicode)  or  cls is None:
                    cls_to_channel[cls] = i
                elif isinstance(cls, list)  or  isinstance(cls, tuple):
                    for c in cls:
                        if isinstance(c, LabelClass):
                            cls_to_channel[c.name] = i
                        elif isinstance(c, str)  or  isinstance(c, unicode):
                            cls_to_channel[c] = i
                        else:
                            raise TypeError, 'Item {0} in label_classes is a list that contains an item that is not a LabelClass or a string but a {1}'.format(i, type(c).__name__)
                else:
                    raise TypeError, 'Item {0} in label_classes is not a LabelClass, string or list, but a {1}'.format(i, type(cls).__name__)
        else:
            raise TypeError, 'label_classes must be a sequence that can contain LabelClass instances, strings or sub-sequences of the former'


        height, width = self.image_shape

        label_image = np.zeros((height, width, len(label_classes)), dtype=int)

        channel_label_count = [0] * len(label_classes)

        for label in self.labels:
            label_type = label['label_type']
            label_channel = cls_to_channel.get(label['label_class'], None)
            if label_channel is not None:
                if label_type == 'polygon':
                    # Polygonal label
                    vertices = label['vertices']
                    if len(vertices) >= 3:
                        polygon = [(v['x'], v['y'])  for v in vertices]

                        img = Image.new('L', (width, height), 0)
                        if fill:
                            ImageDraw.Draw(img).polygon(polygon, outline=1, fill=1)
                        else:
                            ImageDraw.Draw(img).polygon(polygon, outline=1, fill=0)
                        mask = np.array(img)

                        value = channel_label_count[label_channel]
                        channel_label_count[label_channel] += 1

                        label_image[mask >= 0.5, label_channel] = value + 1
                elif label_type == 'composite':
                    pass
                else:
                    raise TypeError, 'Unknown label type {0}'.format(label_type)

        return label_image, np.array(channel_label_count)


    def extract_label_images(self, label_class_set=None):
        """
        Extract an image of each labelled entity.
        The resulting image is the original image masked with an alpha channel that results from rendering the label

        :param label_class_set: a sequence of classes whose labels should be rendered, or None for all labels
        :return: a list of (H,W,C) image arrays
        """
        img_col = self.pixels
        image_shape = self.image_shape

        label_images = []

        for label in self.labels:
            label_type = label['label_type']
            if label_class_set is None  or  label['label_class'] in label_class_set:
                if label_type == 'polygon':
                    # Polygonal label
                    vertices = label['vertices']
                    if len(vertices) >= 3:
                        polygon = [(v['x'], v['y'])  for v in vertices]
                        np_poly = np.array(polygon)

                        lx = int(math.floor(np.min(np_poly[:,0])))
                        ly = int(math.floor(np.min(np_poly[:,1])))
                        ux = int(math.ceil(np.max(np_poly[:,0])))
                        uy = int(math.ceil(np.max(np_poly[:,1])))

                        # Given that the images and labels may have been warped by a transformation,
                        # there is no guarantee that they lie within the bounds of the image
                        lx = max(min(lx, image_shape[1]), 0)
                        ux = max(min(ux, image_shape[1]), 0)
                        ly = max(min(ly, image_shape[0]), 0)
                        uy = max(min(uy, image_shape[0]), 0)

                        w = ux - lx
                        h = uy - ly

                        if w > 0  and  h > 0:
                            np_box_poly = np_poly - np.array([[lx, ly]])
                            box_poly = [(np_box_poly[i,0], np_box_poly[i,1])   for i in xrange(np_box_poly.shape[0])]

                            img = Image.new('L', (w, h), 0)
                            ImageDraw.Draw(img).polygon(box_poly, outline=1, fill=1)
                            mask = np.array(img)

                            if (mask > 0).any():
                                img_box = img_col[ly:uy, lx:ux]
                                if len(img_box.shape) == 2:
                                    # Convert greyscale image to RGB:
                                    img_box = gray2rgb(img_box)
                                # Append the mask as an alpha channel
                                object_img = np.append(img_box, mask[:,:,None], axis=2)

                                label_images.append(object_img)
                elif label_type == 'composite':
                    pass
                else:
                    raise TypeError, 'Unknown label type {0}'.format(label_type)

        return label_images



class InMemoryLabelledImage (AbsractLabelledImage):
    def __init__(self, pixels, labels=None):
        super(InMemoryLabelledImage, self).__init__()
        if labels is None:
            labels = []
        self.__pixels = pixels
        self.__labels = labels


    @property
    def pixels(self):
        return self.__pixels

    def data_and_mime_type_and_size(self):
        buf = io.BytesIO()
        imsave(buf, self.__pixels, format='png')
        return buf.getvalue(), 'image/png', int(self.__pixels.shape[1]), int(self.__pixels.shape[0])



    @property
    def labels(self):
        return self.__labels

    @labels.setter
    def labels(self, l):
        self.__labels = l

    def has_labels(self):
        return True



class PersistentLabelledImage (AbsractLabelledImage):
    def __init__(self, path, labels_dir=None):
        super(PersistentLabelledImage, self).__init__()
        self.__labels_path = self.__compute_labels_path(path, labels_dir=labels_dir)
        self.__image_path = path
        self.__pixels = None



    @property
    def pixels(self):
        if self.__pixels is None:
            self.__pixels = img_as_float(imread(self.__image_path))
        return self.__pixels

    def data_and_mime_type_and_size(self):
        if os.path.exists(self.__image_path):
            with open(self.__image_path, 'rb') as img:
                shape = self.image_shape
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
        if os.path.exists(self.__labels_path):
            with open(self.__labels_path, 'r') as f:
                try:
                    wrapped = json.load(f)
                except ValueError:
                    return []
                return self.__unwrap_labels(self.image_path, wrapped)
        else:
            return []

    @labels.setter
    def labels(self, l):
        if len(l) == 0:
            if os.path.exists(self.__labels_path):
                os.remove(self.__labels_path)
        else:
            wrapped = self.__wrap_labels(self.image_path, l)
            with open(self.__labels_path, 'w') as f:
                json.dump(wrapped, f, indent=3)


    def has_labels(self):
        return os.path.exists(self.__labels_path)


    @staticmethod
    def __wrap_labels(image_path, labels):
        image_filename = os.path.split(image_path)[1]
        return {'image_filename': image_filename,
                'labels': labels}

    @staticmethod
    def __unwrap_labels(image_path, wrapped_labels):
        if isinstance(wrapped_labels, dict):
            return wrapped_labels['labels']
        elif isinstance(wrapped_labels, list):
            return wrapped_labels
        else:
            raise TypeError, 'Labels loaded from file must either be a dict or a list, not a {0}'.format(type(wrapped_labels))


    @staticmethod
    def __compute_labels_path(path, labels_dir=None):
        p = os.path.splitext(path)[0] + '__labels.json'
        if labels_dir is not None:
            p = os.path.join(labels_dir, os.path.split(p)[1])
        return p


    @classmethod
    def for_directory(cls, dir_path, image_filename_pattern='*.png', with_labels_only=False, labels_dir=None):
        image_paths = glob.glob(os.path.join(dir_path, image_filename_pattern))
        if with_labels_only:
            return [PersistentLabelledImage(img_path, labels_dir=labels_dir)   for img_path in image_paths   if os.path.exists(cls.__compute_labels_path(img_path))]
        else:
            return [PersistentLabelledImage(img_path, labels_dir=labels_dir)   for img_path in image_paths]



class LabelledImageFile (AbsractLabelledImage):
    def __init__(self, path, labels=None, on_set_labels=None):
        super(LabelledImageFile, self).__init__()
        if labels is None:
            labels = []
        self.__labels = labels
        self.__image_path = path
        self.__pixels = None
        self.__on_set_labels = on_set_labels



    @property
    def pixels(self):
        if self.__pixels is None:
            self.__pixels = img_as_float(imread(self.__image_path))
        return self.__pixels

    def data_and_mime_type_and_size(self):
        if os.path.exists(self.__image_path):
            with open(self.__image_path, 'rb') as img:
                shape = self.image_shape
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
            self.__on_set_labels(l)


    def has_labels(self):
        return True




def contours_to_labels(list_of_contours, label_classes=None):
    labels = []
    if not isinstance(label_classes, list):
        label_classes = [label_classes] * len(list_of_contours)
    for contour, lcls in zip(list_of_contours, label_classes):
        vertices = [{'x': contour[i][1], 'y': contour[i][0]}   for i in xrange(contour.shape[0])]
        label = {
            'label_type': 'polygon',
            'label_class': lcls,
            'vertices': vertices
        }
        labels.append(label)
    return labels



def shuffle_images_without_labels(labelled_images):
    with_labels = [img   for img in labelled_images   if img.has_labels()]
    without_labels = [img   for img in labelled_images   if not img.has_labels()]
    random.shuffle(without_labels)
    return with_labels + without_labels








