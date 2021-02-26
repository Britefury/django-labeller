# v0.2.0

## Some compatibility breaking changes

### `WrappedImageLabels` class

The 'labelled image' in the `labelling_tool` were keeping labels and lists of completed tasks alongside any
other metadata and attemting to keep it all sane. The code to do this was getting rather out of hand,
so `WrappedImageLabels` keeps the labels and associated metadata together and switches between JSON and
Python object based representations of the labels as needed.


### Refactor: replaced labelled image classes in `labelling_tool` module with new API in `labelled_image` module *(breaks compatibility)*

The 'labelled image' classes were used by the Flask and Qt based labellers for managing images and their
associated labels. File and memory based images and labels were supported. The API was a mess hence the
re-design. This should make it easier for others to extend this class hierarchy and make use of it.

The functionality of 'labelled images' has now been separated into the `ImageSource` class hierarchy that
support image access and the `LabelsStore` class hierarchy that supports retrieving and updating labels.

The `AbstractLabelledImage`, `InMemoryLabelledImage` `PersistentLabelledImage` and `LabelledImageFile`
now have deprecated wrapper functions in `image_labelling_tool.labelling_tool` to allow old code to hopefully work.
