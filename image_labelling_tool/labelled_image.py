"""Labelled image interfaces for Flask and Qt-based applications.

The classes implemented here provide the interface through which the Flask and Qt based labelling tools
access and update images and their labels.

The most convenient way of providing images to a Flask or Qt based labeler is using a list of `LabelledImage`
instances. Each `LabelledImage` has an image source and a labels store that provide the image and store
the labels respectively.
"""
import pathlib
import io
from abc import abstractmethod
import mimetypes
import json
import numpy as np
from typing import Union, Tuple, List, Any, Optional, Sequence, Mapping, Container, Callable
from PIL import Image
from skimage.util import img_as_ubyte
from skimage import transform
from image_labelling_tool.labelling_tool import WrappedImageLabels, ImageLabels


PathType = Union[pathlib.Path, str]


class ImageSource:
    """Image source abstract base class.

    Provides methods for accessing:
    - a local path on disk, if available or None
    - binary data and mime type, where the image format is a format supported by a web browser
    - image as either a NumPy array or a Pillow image, whichever is more convenient
    - the image size as a `(height, width)` tuple

    These methods are used by the Flask and Qt based labelers to retrieve images.
    """
    @property
    @abstractmethod
    def local_path(self) -> Optional[pathlib.Path]:
        """Get the path of the image on disk, if available, otherwise return None
        :return: path as a string or `None`
        """
        pass

    @abstractmethod
    def image_binary_and_mime_type(self) -> Tuple[bytes, str]:
        """Get the image as a tuple of its binary data and mime type
        :return: tuple `(binary_buffer, mime_type)`
        """
        pass

    @abstractmethod
    def image_as_array_or_pil(self) -> Union[np.ndarray, Image.Image]:
        """Get the image as either a NumPy array or a `PIL.Image`
        :return: NumPy array or `PIL.Image`
        """
        pass

    @property
    @abstractmethod
    def image_size(self) -> Tuple[int, int]:
        """Get the image size as a `(height, width)` tuple
        :return: `(height, width)`
        """
        pass


class FileImageSource (ImageSource):
    class MRUImageCache:
        def __init__(self, size: int = 32):
            """Image cache retaining most recently used entries

            :param size: the maximum number of images to store
            """
            self._path_to_image = {}
            self._access_order = []
            self._size = size

        def __call__(self, path: pathlib.Path):
            path_str = str(path.absolute())
            if path_str in self._path_to_image:
                self._access_order.remove(path_str)
                self._access_order.append(path_str)
                return self._path_to_image[path_str]
            else:
                # Trim cache first
                trim = self._size - 1
                to_remove = self._access_order[:-trim]
                for r in to_remove:
                    del self._path_to_image[r]
                del self._access_order[:-trim]
                # Load image and cache
                img = Image.open(path_str)
                self._path_to_image[path_str] = img
                self._access_order.append(path_str)
                return img

    def __init__(self, image_path: PathType, image_loader: Any = None, store_locally: bool = False):
        """Local file image source.
        The image is stored as a file on disk.

        :param image_path: the path at which the image can be found as a `str` or `pathlib.Path`
        :param image_loader: [optional] a function that loads images to be returned by the `image_for_dextr`
            method. If you want to cache the images to avoid loading them each time, but limit the
            number of images kept in memory, use a `LocalFileImageSource.MRUImageCache` instance.
            Alternatively, the `store_locally` parameter caches it with the instance
        :param store_locally: [optionally] if True, when `image_for_dextr` is called the image will be stored
            in this instance. This could consume a lot of memory if many `LocalFileImageSource` instances
            have their `image_for_dextr` methods called. Note that if `image_loader` is provided and
            `store_locally` is True, then the image will be stored on this instance as well.
        """
        if isinstance(image_path, str):
            image_path = pathlib.Path(image_path)
        self.image_path = image_path
        self._image_loader = image_loader
        self._store_locally = store_locally
        self.__image = None
        self.__image_size = None

    @property
    def local_path(self) -> Optional[pathlib.Path]:
        return self.image_path

    def image_binary_and_mime_type(self) -> Tuple[bytes, str]:
        data = self.image_path.open('rb').read()
        mime_type = mimetypes.guess_type(self.image_path)[0]
        return data, mime_type

    def image_as_array_or_pil(self) -> Union[np.ndarray, Image.Image]:
        """Get the image as either a NumPy array or a `PIL.Image`
        :return: NumPy array or `PIL.Image`
        """
        if self._store_locally and self.__image is not None:
            # Stored locally from a previous call
            return self.__image

        # Get the image
        if self._image_loader is not None:
            img = self._image_loader(self.image_path)
        else:
            img = Image.open(str(self.image_path))

        # Store locally if needed
        if self._store_locally:
            self.__image = img

        # Store the image size
        self.__image_size = img.size[::-1]

        return img

    @property
    def image_size(self) -> Tuple[int, int]:
        """Get the image size as a `(height, width)` tuple
        :return: `(height, width)`
        """
        if self.__image_size is None:
            # Get the image size
            self.__image_size = Image.open(str(self.image_path)).size[::-1]
        return self.__image_size


class InMemoryImageSource (ImageSource):
    def __init__(self, image: Union[np.ndarray, Image.Image]):
        """In memory image source, where the image is represented as either a NumPy array or a PIL Image.

        :param image: image as a NumPy array or PIL Image
        """
        self.image = image

    @property
    def local_path(self) -> Optional[pathlib.Path]:
        return None

    def image_binary_and_mime_type(self) -> Tuple[bytes, str]:
        buf = io.BytesIO()
        if isinstance(self.image, np.ndarray):
            # Convert NumPy array to PIL Image
            pix_u8 = img_as_ubyte(self.image)
            img = Image.fromarray(pix_u8)
        elif isinstance(self.image, Image.Image):
            img = self.image
        else:
            raise TypeError('image is neither a np.ndarray or a PIL Image')
        img.save(buf, format='bmp')
        return buf.getvalue(), 'image/bmp'

    def image_as_array_or_pil(self) -> Union[np.ndarray, Image.Image]:
        """Get the image as either a NumPy array or a `PIL.Image`
        :return: NumPy array or `PIL.Image`
        """
        return self.image

    @property
    def image_size(self) -> Tuple[int, int]:
        """Get the image size as a `(height, width)` tuple
        :return: `(height, width)`
        """
        if isinstance(self.image, np.ndarray):
            return self.image.shape[:2]
        elif isinstance(self.image, Image.Image):
            return self.image.size[::-1]
        else:
            raise TypeError('image is neither a np.ndarray or a PIL Image')


class LabelsStore:
    """Labels store abstract base class.

    Provides the interface by which the labelling tool accesses and updates labels.

    Labels take the form of `WrappedImageLabels` instances that also keep metadata such as the list
    of completed tasks, etc.
    """
    @abstractmethod
    def get_wrapped_labels(self) -> WrappedImageLabels:
        """Get the labels as a `WrappedImageLabels` instance.
        :return: labels as a `WrappedImageLabels` instance.
        """
        pass

    @abstractmethod
    def update_wrapped_labels(self, wrapped_labels: WrappedImageLabels):
        """Update the labels

        :param wrapped_labels: updated wrapped labels
        """
        pass

    @property
    def has_labels(self) -> bool:
        """Return True if labels exist

        :return: boolean
        """
        return False


class FileLabelsStore (LabelsStore):
    def __init__(self, labels_path: PathType, image_filename: Optional[str] = None,
                 readonly: bool = False, delete_if_blank: bool = True):
        """Labels stored in a file on disk.

        Getting the labels will load them from the file, while updating them (e.g. in response
        to user actions within the labelling tool) will write the labels to the file.

        :param labels_path: labels file path as a `str` or `pathlib.Path`
        :param image_filename: [optional] the image filename to be stored in the label metadata,
            only used in cases where the file at `labels_path` does not exist and a blank
            `WrappedImageLabels` instance needs to be created
        :param readonly: if True, updating the labels via the `update_wrapped_labels` method will
            not write the labels to the file at `labels_path`
        :param delete_if_blank: if True, the labels file at `labels_path` will be deleted if
            the `update_wrapped_labels` method is called with blank labels (no labels defined,
            no completed tasks). `update_wrapped_labels` is normally invoked due to user actions
            from within the tool.
        """
        if isinstance(labels_path, str):
            labels_path = pathlib.Path(labels_path)

        self.labels_path = labels_path
        self.image_filename = image_filename
        self.readonly = readonly
        self.delete_if_blank = delete_if_blank
        self._labels = None

    def get_wrapped_labels(self) -> WrappedImageLabels:
        if self._labels is None:
            if self.labels_path.exists():
                self._labels = WrappedImageLabels.from_file(self.labels_path)
            else:
                self._labels = WrappedImageLabels(
                    image_filename=self.image_filename, labels=ImageLabels([]))
        return self._labels

    def update_wrapped_labels(self, wrapped_labels: WrappedImageLabels):
        """Update the labels

        :param wrapped_labels: updated wrapped labels
        """
        self._labels = wrapped_labels
        if not self.readonly:
            if wrapped_labels.is_blank and self.delete_if_blank:
                # Blank and deletion is requested
                if self.labels_path.exists():
                    self.labels_path.unlink()
            else:
                with self.labels_path.open('w') as f_out:
                    json.dump(wrapped_labels.to_json(), f_out, indent=2)

    @property
    def has_labels(self) -> bool:
        """Return True if labels exist

        :return: boolean
        """
        return self.labels_path.exists()


class InMemoryLabelsStore (LabelsStore):
    def __init__(self, wrapped_labels: WrappedImageLabels = None, image_filename: str = None,
                 on_update: Optional[Callable[[WrappedImageLabels], None]] = None):
        """Labels stored in memory.

        The labels are kept in memory as a `WrappedImageLabels` instance.

        :param wrapped_labels: [optional] the initial labels at the start
        :param image_filename: [optional] the image filename to be stored in the label metadata,
            only used in cases where the file at `labels_path` does not exist and a blank
            `WrappedImageLabels` instance needs to be created
        :param on_update: [optional] a callback function of the form `fn(wrapped_labels)` that will be
            invoked when the labels are updated, normally due to user actions
        """
        if wrapped_labels is None:
            wrapped_labels = WrappedImageLabels(
                    image_filename=image_filename, labels=ImageLabels([]))
        self.wrapped_labels = wrapped_labels
        self._on_update = on_update

    def get_wrapped_labels(self) -> WrappedImageLabels:
        return self.wrapped_labels

    def update_wrapped_labels(self, wrapped_labels):
        """Update the labels

        :param wrapped_labels: updated wrapped labels
        """
        self.wrapped_labels = wrapped_labels
        if self._on_update is not None:
            self._on_update(self.wrapped_labels)

    @property
    def has_labels(self) -> bool:
        """Return True if labels exist

        :return: boolean
        """
        return not self.wrapped_labels.is_blank

    @staticmethod
    def from_json(labels_js: Any) -> 'InMemoryLabelsStore':
        """Construct an in-memory labels store from JSON representation

        :param labels_js: labels in JSON form
        :return: an `InMemoryLabelsStore`
        """
        wrapped_labels = WrappedImageLabels.from_json(labels_js)
        return InMemoryLabelsStore(wrapped_labels)


class LabelledImage:
    """A labelled image; pairs an image source (file/memory/etc.) with a labels store (file/memory/etc.)

    Provides convenience methods for warping the images and labels and rendering the labels.
    """
    def __init__(self, image_source: ImageSource, labels_store: LabelsStore):
        """A labelled image.

        The interface through which labelling tools can conveniently access images to label and
        access and update their corresponding labels.

        An image source that provides the image is paired with a labels store that stores the labels.

        You may combine on-disk or in-memory images and labels using the classes defined in this module.
        Alternatively you can derive from the abstract base classes in order to provide your own.

        :param image_source: an `ImageSource` instance
        :param labels_store: a `LabelsStore` instance
        """
        self.image_source = image_source
        self.labels_store = labels_store

    @property
    def labels(self) -> ImageLabels:
        return self.labels_store.get_wrapped_labels().labels

    @property
    def wrapped_labels(self) -> WrappedImageLabels:
        return self.labels_store.get_wrapped_labels()

    @property
    def has_labels(self) -> bool:
        return self.labels_store.has_labels

    @property
    def wrapped_labels(self) -> WrappedImageLabels:
        return self.labels_store.get_wrapped_labels()

    def warped(self, transformation: Any, sz_px: Tuple[int, int]) -> 'LabelledImage':
        """Warp the image and associated labels

        :param transformation: transformation to apply as a `skimage.transform._geometric.GeometricTransform`
        :param sz_px: the size of the transformed image in pixels as a `(height, width)` tuple
        :return:
        """
        # Get the image as a NumPy array
        image_pixels = np.array(self.image_source.image_as_array_or_pil())
        # Warp the image
        warped_pixels = transform.warp(image_pixels, transformation.inverse)[:int(sz_px[0]), :int(sz_px[1]), ...]
        # Get the wrapped labels
        wlabels = self.labels_store.get_wrapped_labels()
        # Get the ImageLabels instance and warp it
        warped_image_labels = wlabels.labels.warped(transformation)
        # Wrapped labels instance with labels replaced
        warped_labels = wlabels.with_labels(warped_image_labels)
        return LabelledImage(InMemoryImageSource(warped_pixels), InMemoryLabelsStore(warped_labels))

    def render_label_classes(self, label_classes: Union[Sequence[str], Mapping[str, int]],
                             multichannel_mask: bool = False, fill: bool = True) -> np.ndarray:
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
        return self.labels_store.get_wrapped_labels().labels.render_label_classes(
            label_classes, self.image_source.image_size, multichannel_mask=multichannel_mask, fill=fill)

    def render_label_instances(self, label_classes: Union[Sequence[str], Mapping[str, int]],
                               multichannel_mask: bool = False, fill: bool = True) -> Tuple[np.ndarray, np.ndarray]:
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
        return self.labels_store.get_wrapped_labels().labels.render_label_instances(
            label_classes, self.image_source.image_size, multichannel_mask=multichannel_mask, fill=fill)

    def extract_label_images(self, label_class_set: Optional[Container[str]] = None) -> List[np.ndarray]:
        """
        Extract an image of each labelled entity.
        The resulting image is the original image masked with an alpha channel that results from rendering the label

        :param label_class_set: a sequence of classes whose labels should be rendered, or None for all labels
        :return: a list of (H,W,C) image arrays
        """
        # Get the image as a NumPy array
        image_pixels = np.array(self.image_source.image_as_array_or_pil())
        return self.labels_store.get_wrapped_labels().labels.extract_label_images(
            image_pixels, label_class_set=label_class_set)

    @staticmethod
    def _compute_labels_path(image_path: pathlib.Path, labels_dir: pathlib.Path,
                             label_suffix: str) -> pathlib.Path:
        filename = image_path.stem + label_suffix
        if labels_dir is None:
            labels_dir = image_path.parent
        return labels_dir / filename

    @classmethod
    def for_directory(cls, images_dir: PathType, image_filename_patterns: Sequence[str] = ('*.png', '*.jpg'),
                      with_labels_only: bool = False, labels_dir: Optional[PathType] = None,
                      readonly: bool = False, delete_if_blank: bool = True,
                      label_suffix: str = '__labels.json', image_loader: Any = None,
                      store_locally: bool = False) -> List['LabelledImage']:
        """Search a directory for image files and construct `LabelledImage` instances for them.
        If `with_labels_only` is True, image files without corresponding label files will not be included.
        If `labels_dir` is provided, the label files will be stored in that directory, otherwise by default
        a label file will be stored in the same directory as its' corresponding image.
        Filenames for label files are generated by stripping the extension from the image filename and
        appending `label_suffix`; providing a value for this parameter allows you customize the suffix
        and extension.

        :param images_dir: the path of the directory to search as a `str` or `pathlib.Path` instance
        :param image_filename_patterns: sequence of image filename patterns, e.g. '*.png'. Default
            is `['*.png', '*.jpg']`, so all PNG and JPEG files will be used.
        :param with_labels_only: if True, skip images for which no corresponding label file can be found
        :param labels_dir: [optional] a directory as a `str` or `pathlib.Path` in which the label files are to
            be stored
        :param readonly: if True, labels are read-only and changes made by the user will *not* be saved to the
            label files
        :param delete_if_blank: if True, the labels files will be deleted if user actions in the tool
            result in blank labels (no labels defined and no completed tasks)
        :param label_suffix: the suffix for label files
        :param image_loader: image loader used for caching etc. (see `FileImageSource` constructor)
        :param store_locally: if True, the `FileImageSource` created for each image will cache
            the image in memory, if loaded for DEXTR, etc. (note that this could consume a lot of memory).
        :return: a list of `LabelledImage` instances
        """
        if isinstance(images_dir, str):
            images_dir = pathlib.Path(images_dir)
        images_dir = images_dir.absolute()

        image_paths = []
        for pat in image_filename_patterns:
            image_paths.extend(list(images_dir.glob(pat)))
        return cls.for_image_files(image_paths, with_labels_only=with_labels_only, labels_dir=labels_dir,
                                   readonly=readonly, delete_if_blank=delete_if_blank, label_suffix=label_suffix,
                                   image_loader=image_loader, store_locally=store_locally)

    @classmethod
    def for_image_files(cls, image_paths: Sequence[PathType], with_labels_only: bool = False,
                        labels_dir: Optional[PathType] = None, readonly: bool = False, delete_if_blank: bool = True,
                        label_suffix: str = '__labels.json', image_loader: Any = None,
                        store_locally: bool = False) -> List['LabelledImage']:
        """Construct `LabelledImage` instances for the on-disk image files in `image_paths`.
        If `with_labels_only` is True, image files without corresponding label files will not be included.
        If `labels_dir` is provided, the label files will be stored in that directory, otherwise by default
        a label file will be stored in the same directory as its' corresponding image.
        Filenames for label files are generated by stripping the extension from the image filename and
        appending `label_suffix`; providing a value for this parameter allows you customize the suffix
        and extension.

        Note that in the case where the label file path generation process would result in multiple images
        having the same labels path, a `ValueError` is raised.

        :param image_paths: the paths of the images as a sequence of `str` or `pathlib.Path` instances
        :param with_labels_only: if True, skip images for which no corresponding label file can be found
        :param labels_dir: [optional] a directory as a `str` or `pathlib.Path` in which the label files are to
            be stored
        :param readonly: if True, labels are read-only and changes made by the user will *not* be saved to the
            label files
        :param delete_if_blank: if True, the labels files will be deleted if user actions in the tool
            result in blank labels (no labels defined and no completed tasks)
        :param label_suffix: the suffix for label files
        :param image_loader: image loader used for caching etc. (see `FileImageSource` constructor)
        :param store_locally: if True, the `FileImageSource` created for each image will cache
            the image in memory, if loaded for DEXTR, etc. (note that this could consume a lot of memory).
        :return: a list of `LabelledImage` instances
        """
        if isinstance(labels_dir, str):
            labels_dir = pathlib.Path(labels_dir)

        path_pairs = []
        label_path_to_image_path = {}
        for img_path in image_paths:
            if isinstance(img_path, str):
                img_path = pathlib.Path(img_path)

            labels_path = cls._compute_labels_path(img_path, labels_dir=labels_dir, label_suffix=label_suffix)
            if labels_path in label_path_to_image_path:
                raise ValueError('Duplicate label paths: the images at {} and {} both have the '
                                 'same label path {}'.format(label_path_to_image_path[labels_path], img_path,
                                                             labels_path))

            path_pairs.append((img_path, labels_path))
            label_path_to_image_path[labels_path] = img_path

        return LabelledImage.for_image_label_file_pairs(path_pairs, with_labels_only=with_labels_only,
                                                        readonly=readonly, delete_if_blank=delete_if_blank,
                                                        image_loader=image_loader, store_locally=store_locally)

    @classmethod
    def for_image_label_file_pairs(cls, path_pairs: Sequence[Tuple[PathType, PathType]],
                                   with_labels_only: bool = False, readonly: bool = False,
                                   delete_if_blank: bool = True, image_loader: Any = None,
                                   store_locally: bool = False) -> List['LabelledImage']:
        """Construct `LabelledImage` instances for the on-disk image files in `image_paths`.
        If `with_labels_only` is True, image files without corresponding label files will not be included.

        :param path_pairs: a sequence of pairs (tuples) of `(image_path, labels_path)` where `images_path`
            and `labels_path` are `str` or `pathlib.Path` instances
        :param with_labels_only: if True, skip images for which no corresponding label file can be found
        :param readonly: if True, labels are read-only and changes made by the user will *not* be saved to the
            label files
        :param delete_if_blank: if True, the labels files will be deleted if user actions in the tool
            result in blank labels (no labels defined and no completed tasks)
        :param image_loader: image loader used for caching etc. (see `FileImageSource` constructor)
        :param store_locally: if True, the `FileImageSource` created for each image will cache
            the image in memory, if loaded for DEXTR, etc. (note that this could consume a lot of memory).
        :return: a list of `LabelledImage` instances
        """
        limgs = []
        for img_path, labels_path in path_pairs:
            if isinstance(img_path, str):
                img_path = pathlib.Path(img_path)
            if isinstance(labels_path, str):
                labels_path = pathlib.Path(labels_path)

            if not with_labels_only or labels_path.exists():
                limgs.append(cls.for_image_label_file_pair(img_path, labels_path, readonly=readonly,
                                                           delete_if_blank=delete_if_blank, image_loader=image_loader,
                                                           store_locally=store_locally))
        return limgs

    @classmethod
    def for_image_label_file_pair(cls, image_path: PathType, labels_path: PathType, readonly: bool = False,
                                  delete_if_blank: bool = True, image_loader: Any = None,
                                  store_locally: bool = False) -> 'LabelledImage':
        """Construct a `LabelledImage` instance for an on-disk image file paired with a label file.

        :param image_path: image path as a `str` or `pathlib.Path` instance
        :param labels_path: labels file path as a `str` or `pathlib.Path` instance
        :param readonly: if True, labels are read-only and changes made by the user will *not* be saved to the
            label files
        :param delete_if_blank: if True, the labels files will be deleted if user actions in the tool
            result in blank labels (no labels defined and no completed tasks)
        :param image_loader: image loader used for caching etc. (see `FileImageSource` constructor)
        :param store_locally: if True, the `FileImageSource` created for each image will cache
            the image in memory, if loaded for DEXTR, etc. (note that this could consume a lot of memory).
        :return: a `LabelledImage` instance
        """
        if isinstance(image_path, str):
            image_path = pathlib.Path(image_path)
        if isinstance(labels_path, str):
            labels_path = pathlib.Path(labels_path)

        image_source = FileImageSource(image_path, image_loader=image_loader, store_locally=store_locally)
        labels_store = FileLabelsStore(labels_path, image_filename=image_path.name,
                                       readonly=readonly, delete_if_blank=delete_if_blank)
        return LabelledImage(image_source, labels_store)

    @classmethod
    def in_memory(cls, image, wrapped_labels):
        image_source = InMemoryImageSource(image)
        labels_store = InMemoryLabelsStore(wrapped_labels)
        return LabelledImage(image_source, labels_store)


def shuffle_images_without_labels(labelled_images: Sequence[LabelledImage],
                                  random_state: Union[np.random.RandomState, int] = 12345) -> List[LabelledImage]:
    """Re-orderes a sequence if labelled images, such that those with labels come before those without,
    and the images without labels are shuffled.

    :param labelled_images: images to re-order
    :param random_state: [optional] random state for shuffling
    :return: re-ordered list of labelled images
    """
    if isinstance(random_state, int):
        random_state = np.random.RandomState(random_state)
    with_labels = [img   for img in labelled_images   if img.has_labels]
    without_labels = [img   for img in labelled_images   if not img.has_labels]
    random_state.shuffle(without_labels)
    return with_labels + without_labels
