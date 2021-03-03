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
from PyQt5 import QtWidgets, QtWebEngineWidgets
import click
from image_labelling_tool_qt import controls, web_server


@click.command(context_settings=dict(ignore_unknown_options=True, allow_extra_args=True))
@click.option('--dextr_weights', type=click.Path())
@click.option('--enable_firebug', is_flag=True, default=False)
@click.option('--use_http_memory_cache', is_flag=True, default=False)
def run_app(dextr_weights, enable_firebug, use_http_memory_cache):
    import pathlib
    import glob
    from image_labelling_tool import labelled_image, labelling_tool

    # Create an application
    app = QtWidgets.QApplication([])

    # Start with a dialog that allows the user to choose the images directory, optionally
    # a labels directory and read only checkbox
    init_dialog = QtWidgets.QDialog()
    # Dialog layout
    dia_layout = QtWidgets.QGridLayout()
    init_dialog.setLayout(dia_layout)

    images_dir = ['.']
    labels_dir = [None]

    # Prompt
    prompt_label = QtWidgets.QLabel('Choose an images directory and optionally a labels directory.')
    dia_layout.addWidget(prompt_label, 0, 0, 1, 2)

    # Images directory
    images_dir_button = QtWidgets.QPushButton('Choose images directory')
    images_dir_button.setIcon(init_dialog.style().standardIcon(QtWidgets.QStyle.SP_DirOpenIcon))
    images_dir_label = QtWidgets.QLabel(images_dir[0])

    def _on_images_dir_button():
        file_dialog = QtWidgets.QFileDialog(None, 'Choose images directory', '')
        file_dialog.setFileMode(QtWidgets.QFileDialog.Directory)
        choice = file_dialog.exec()
        if choice == QtWidgets.QFileDialog.Accepted:
            images_dir[0] = file_dialog.selectedFiles()[0]
            images_dir_label.setText(images_dir[0])

    images_dir_button.clicked.connect(_on_images_dir_button)
    dia_layout.addWidget(images_dir_button, 1, 0)
    dia_layout.addWidget(images_dir_label, 1, 1)

    # Labels directory
    labels_dir_button = QtWidgets.QPushButton('[Optional] Choose labels directory')
    labels_dir_button.setIcon(init_dialog.style().standardIcon(QtWidgets.QStyle.SP_DirOpenIcon))
    labels_dir_label = QtWidgets.QLabel('')

    def _on_labels_dir_button():
        file_dialog = QtWidgets.QFileDialog(None, 'Choose labels directory', '')
        file_dialog.setFileMode(QtWidgets.QFileDialog.Directory)
        choice = file_dialog.exec()
        if choice == QtWidgets.QFileDialog.Accepted:
            labels_dir[0] = file_dialog.selectedFiles()[0]
            labels_dir_label.setText(labels_dir[0])

    labels_dir_button.clicked.connect(_on_labels_dir_button)
    dia_layout.addWidget(labels_dir_button, 2, 0)
    dia_layout.addWidget(labels_dir_label, 2, 1)

    # Read only checkbox
    read_only_check = QtWidgets.QCheckBox('Read only')
    dia_layout.addWidget(read_only_check, 3, 1)

    # Read only checkbox
    read_only_check = QtWidgets.QCheckBox('Read only')
    dia_layout.addWidget(read_only_check, 3, 1)

    # DEXTR checkbox
    dextr_check = QtWidgets.QCheckBox('Enable DEXTR')
    dia_layout.addWidget(dextr_check, 4, 1)

    # Buttons
    ok_button = QtWidgets.QPushButton('Ok')
    ok_button.setIcon(init_dialog.style().standardIcon(QtWidgets.QStyle.SP_DialogOkButton))

    def _on_ok():
        init_dialog.accept()

    ok_button.clicked.connect(_on_ok)
    cancel_button = QtWidgets.QPushButton('Cancel')
    cancel_button.setIcon(init_dialog.style().standardIcon(QtWidgets.QStyle.SP_DialogCancelButton))

    def _on_cancel():
        init_dialog.reject()

    cancel_button.clicked.connect(_on_cancel)
    dia_layout.addWidget(ok_button, 5, 0)
    dia_layout.addWidget(cancel_button, 5, 1)

    # Run the dialog
    action = init_dialog.exec()

    if action == QtWidgets.QDialog.Accepted:
        images_dir = pathlib.Path(images_dir[0])
        if labels_dir[0] is not None:
            labels_dir = pathlib.Path(labels_dir[0])
        else:
            labels_dir = None
        enable_dextr = dextr_check.checkState()
        readonly = read_only_check.checkState()

        server = web_server.LabellerServer()
        server.start_flask_server()

        try:
            # If DEXTR is to be made available
            if enable_dextr or dextr_weights is not None:
                from dextr.model import DextrModel
                import torch

                # Load the dextr model
                device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")

                if dextr_weights is not None:
                    dextr_weights = pathlib.Path(dextr_weights).expanduser()
                    dextr_model = torch.load(dextr_weights, map_location=device)
                else:
                    dextr_model = DextrModel.pascalvoc_resunet101().to(device)

                # Evaluation mode
                dextr_model.eval()

                # Define a mask prediction function
                dextr_fn = lambda image, points: dextr_model.predict([image], points[None, :, :])[0] >= 0.5
            else:
                dextr_fn = None


            # Colour schemes
            # The user may select different colour schemes for different tasks.
            # If you have a lot of classes, it will be difficult to select colours that are easily distinguished
            # from one another. For one task e.g. segmentation, design a colour scheme that highlights the different
            # classes for that task, while another task e.g. fine-grained classification would use another scheme.
            # Each colour scheme is a dictionary containing the following:
            #   name: symbolic name (Python identifier)
            #   human_name: human readable name for UI
            # These colour schemes are going to split the classes by 'default' (all), natural, and artificial.
            # Not really useful, but demonstrates the feature.
            colour_schemes = [
                dict(name='default', human_name='All'),
                dict(name='natural', human_name='Natural'),
                dict(name='artificial', human_name='Artifical')
            ]

            # Specify our label classes, organised in groups.
            # `LabelClass` parameters are:
            #   symbolic name (Python identifier)
            #   human readable name for UI
            #   and colours by colour scheme, as a dict mapping colour scheme name to RGB value as a list
            # The label classes are arranged in groups and will be displayed as such in the UI.
            # `LabelClassGroup` parameters are:
            #   human readable name for UI
            #   label class (`LabelClass` instance) list
            label_classes = [
                labelling_tool.LabelClassGroup('Natural', [
                    labelling_tool.LabelClass('tree', 'Trees', dict(default=[0, 255, 192], natural=[0, 255, 192],
                                                                    artificial=[128, 128, 128])),
                    labelling_tool.LabelClass('lake', 'Lake', dict(default=[0, 128, 255], natural=[0, 128, 255],
                                                                   artificial=[128, 128, 128])),
                    labelling_tool.LabelClass('flower', 'Flower', dict(default=[255, 96, 192], natural=[255, 192, 96],
                                                                       artificial=[128, 128, 128])),
                    labelling_tool.LabelClass('leaf', 'Leaf', dict(default=[65, 255, 0], natural=[65, 255, 0],
                                                                   artificial=[128, 128, 128])),
                    labelling_tool.LabelClass('stem', 'Stem', dict(default=[128, 64, 0], natural=[128, 64, 0],
                                                                   artificial=[128, 128, 128])),
                ]),
                labelling_tool.LabelClassGroup('Artificial', [
                    labelling_tool.LabelClass('building', 'Buildings', dict(default=[255, 128, 0], natural=[128, 128, 128],
                                                                           artificial=[255, 128, 0])),
                    labelling_tool.LabelClass('wall', 'Wall', dict(default=[0, 128, 255], natural=[128, 128, 128],
                                                                   artificial=[0, 128, 255])),
                ])]

            # Annotation controls
            # Labels may also have optional meta-data associated with them
            # You could use this for e.g. indicating if an object is fully visible, mostly visible or significantly obscured.
            # You could also indicate quality (e.g. blurriness, etc)
            # There are three types of annotation. They have some common properties:
            #   name: symbolic name (Python identifier)
            #   label_text: label text in UI
            #   visibility_label_text: [optional] if provided, label visibility can be filtered by this annotation value,
            #       in which case a drop down will appear in the UI allowing the user to select a filter value
            #       that will hide/show labels accordinly
            # Check box (boolean value):
            #   `labelling_tool.AnnoControlCheckbox`; only the 3 common parameters listed above
            # Radio button (choice from a list):
            #   `labelling_tool.AnnoControlRadioButtons`; the 3 common parameters listed above and:
            #       choices: list of `labelling_tool.AnnoControlRadioButtons.choice` that provide:
            #           value: symbolic value name for choice
            #           label_text: choice label text in UI
            #           tooltip: extra information for user
            #       label_on_own_line [optional]: if True, place the label and the buttons on a separate line in the UI
            # Popup menu (choice from a grouped list):
            #   `labelling_tool.AnnoControlPopupMenu`; the 3 common parameters listed above and::
            #       groups: list of groups `labelling_tool.AnnoControlPopupMenu.group`:
            #           label_text: group label text in UI
            #           choices: list of `labelling_tool.AnnoControlPopupMenu.choice` that provide:
            #               value: symbolic value name for choice
            #               label_text: choice label text in UI
            #               tooltip: extra information for user
            anno_controls = [
                labelling_tool.AnnoControlCheckbox('good_quality', 'Good quality',
                                                   visibility_label_text='Filter by good quality'),
                labelling_tool.AnnoControlRadioButtons('visibility', 'Visible', choices=[
                    labelling_tool.AnnoControlRadioButtons.choice(value='full', label_text='Fully',
                                                                  tooltip='Object is fully visible'),
                    labelling_tool.AnnoControlRadioButtons.choice(value='mostly', label_text='Mostly',
                                                                  tooltip='Object is mostly visible'),
                    labelling_tool.AnnoControlRadioButtons.choice(value='obscured', label_text='Obscured',
                                                                  tooltip='Object is significantly obscured'),
                ], label_on_own_line=False, visibility_label_text='Filter by visibility'),
                labelling_tool.AnnoControlPopupMenu('material', 'Material', groups=[
                    labelling_tool.AnnoControlPopupMenu.group(label_text='Artifical/buildings', choices=[
                        labelling_tool.AnnoControlPopupMenu.choice(value='concrete', label_text='Concrete',
                                                                   tooltip='Concrete objects'),
                        labelling_tool.AnnoControlPopupMenu.choice(value='plastic', label_text='Plastic',
                                                                   tooltip='Plastic objects'),
                        labelling_tool.AnnoControlPopupMenu.choice(value='asphalt', label_text='Asphalt',
                                                                   tooltip='Road, pavement, etc.'),
                    ]),
                    labelling_tool.AnnoControlPopupMenu.group(label_text='Flat natural', choices=[
                        labelling_tool.AnnoControlPopupMenu.choice(value='grass', label_text='Grass',
                                                                   tooltip='Grass covered ground'),
                        labelling_tool.AnnoControlPopupMenu.choice(value='water', label_text='Water',
                                                                   tooltip='Water/lake')]),
                    labelling_tool.AnnoControlPopupMenu.group(label_text='Vegetation', choices=[
                        labelling_tool.AnnoControlPopupMenu.choice(value='trees', label_text='Trees', tooltip='Trees'),
                        labelling_tool.AnnoControlPopupMenu.choice(value='shrubbery', label_text='Shrubs',
                                                                   tooltip='Shrubs/bushes'),
                        labelling_tool.AnnoControlPopupMenu.choice(value='flowers', label_text='Flowers',
                                                                   tooltip='Flowers'),
                        labelling_tool.AnnoControlPopupMenu.choice(value='ivy', label_text='Ivy', tooltip='Ivy')]),
                ], visibility_label_text='Filter by material')
            ]

            image_paths = list(images_dir.glob('*.jpg')) + list(images_dir.glob('*.png'))
            image_paths = [p.absolute() for p in image_paths]

            # Create a `PersistentLabelledImage` instance for each image file
            labelled_images = labelled_image.LabelledImage.for_image_files(
                image_paths, labels_dir=labels_dir, readonly=bool(readonly))
            print('Loaded {0} images'.format(len(labelled_images)))


            config = web_server.DEFAULT_CONFIG

            # Example tasks to appear in checkboxes
            tasks = [
                dict(name='finished', human_name='[old] finished'),
                dict(name='segmentation', human_name='Outlines'),
                dict(name='classification', human_name='Classification'),
            ]

            # And a window
            win = QtWidgets.QWidget()
            win.setWindowTitle('Simple Qt Image Labeller')

            # And give it a layout
            layout = QtWidgets.QVBoxLayout()
            win.setLayout(layout)

            # Create the labeller
            lbl = controls.QLabellerForLabelledImages(
                server=server, label_classes=label_classes, labelled_images=labelled_images,
                tasks=tasks, colour_schemes=colour_schemes,
                anno_controls=anno_controls, config=config, dextr_fn=dextr_fn,
                enable_firebug=enable_firebug)
            # Create the web engine view
            view = QtWebEngineWidgets.QWebEngineView()

            # If requested, use a memory-based HTTP cache
            # This is very useful if the client-side Javascript code is being developed
            # as otherwise chromium's cache will often store old versions of the code that
            # will hamper debugging and deveopment
            if use_memory_cache:
                page.profile().setHttpCacheType(QtWebEngineWidgets.QWebEngineProfile.MemoryHttpCache)

            # Attach the labeller to the web engine view
            lbl.attach_to_web_engine_view(view)

            # Add the QWebView to the layout
            layout.addWidget(view)

            # Show the window and run the app
            win.show()

            app.exec_()
        finally:
            print('Stopping server')
            server.stop_server()


if __name__ == '__main__':
    run_app()