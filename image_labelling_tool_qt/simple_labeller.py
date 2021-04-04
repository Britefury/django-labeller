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
from typing import Optional
from PyQt5 import QtWidgets, QtWebEngineWidgets, QtGui
import click
import pathlib
from image_labelling_tool_qt import controls, web_server


class LabellerWindow (QtWidgets.QMainWindow):
    def __init__(self, tool):
        super(LabellerWindow, self).__init__(None)

        self.tool = tool

        self.setWindowTitle('Image Labeller')

        schema_json = tool.schema_store.get_schema_json()

        # Create the labeller
        self._labeller = controls.QLabellerForLabelledImages(
            server=tool.server, labelled_images=tool.labelled_images, schema=schema_json,
            tasks=tool.tasks, anno_controls=tool.anno_controls, config=tool.config, dextr_fn=tool.dextr_fn,
            enable_firebug=tool.enable_firebug)
        # Create the web engine view
        self._view = QtWebEngineWidgets.QWebEngineView()

        # If requested, use a memory-based HTTP cache
        # This is very useful if the client-side Javascript code is being developed
        # as otherwise chromium's cache will often store old versions of the code that
        # will hamper debugging and development
        if tool.use_http_memory_cache:
            self._view.page().profile().setHttpCacheType(QtWebEngineWidgets.QWebEngineProfile.MemoryHttpCache)

        # Attach the labeller to the web engine view
        self._labeller.attach_to_web_engine_view(self._view)

        # Add the QWebView to the layout
        self.setCentralWidget(self._view)

        # Switch tool action
        switch_to_schema_editor = QtWidgets.QAction(self.style().standardIcon(QtWidgets.QStyle.SP_ArrowRight), 'Switch to schema editor', self)
        switch_to_schema_editor.setStatusTip('Switch to schema editor')
        switch_to_schema_editor.triggered.connect(self.on_switch_to_schema_editor)

        menubar = self.menuBar()
        switch_tool_menu = menubar.addMenu('&Switch tool')
        switch_tool_menu.addAction(switch_to_schema_editor)

    def on_switch_to_schema_editor(self):
        self.tool.close_labeller()
        self.tool.open_schema_editor()


class SchemaEditorWindow (QtWidgets.QMainWindow):
    def __init__(self, tool):
        super(SchemaEditorWindow, self).__init__(None)

        self.tool = tool

        self.setWindowTitle('Schema editor')

        # Create the labeller
        self._schema_editor = controls.QSchemaEditorForSchemaStore(
            server=tool.server, schema_store=tool.schema_store, enable_firebug=tool.enable_firebug)
        # Create the web engine view
        self._view = QtWebEngineWidgets.QWebEngineView()

        # If requested, use a memory-based HTTP cache
        # This is very useful if the client-side Javascript code is being developed
        # as otherwise chromium's cache will often store old versions of the code that
        # will hamper debugging and development
        if tool.use_http_memory_cache:
            self._view.page().profile().setHttpCacheType(QtWebEngineWidgets.QWebEngineProfile.MemoryHttpCache)

        # Attach the labeller to the web engine view
        self._schema_editor.attach_to_web_engine_view(self._view)

        # Add the QWebView to the layout
        self.setCentralWidget(self._view)

        # Switch tool action
        switch_to_labeller = QtWidgets.QAction(self.style().standardIcon(QtWidgets.QStyle.SP_ArrowRight), 'Switch to labeller', self)
        switch_to_labeller.setStatusTip('Switch to labeller')
        switch_to_labeller.triggered.connect(self.on_switch_to_labeller)

        menubar = self.menuBar()
        switch_tool_menu = menubar.addMenu('&Switch tool')
        switch_tool_menu.addAction(switch_to_labeller)

    def on_switch_to_labeller(self):
        self.tool.close_schema_editor()
        self.tool.open_labeller()


class Tool:
    def __init__(self, server, labelled_images, schema_store, tasks, anno_controls, config,
                 dextr_fn, enable_firebug, use_http_memory_cache):
        self.server = server
        self.schema_store = schema_store
        self.labelled_images = labelled_images
        self.tasks = tasks
        self.anno_controls = anno_controls
        self.config = config
        self.dextr_fn = dextr_fn
        self.enable_firebug = enable_firebug
        self.use_http_memory_cache = use_http_memory_cache

        self._labeller = None
        self._schema_editor = None

    def open_labeller(self):
        self._labeller = LabellerWindow(self)
        self._labeller.show()

    def close_labeller(self):
        self._labeller.close()
        self._labeller = None

    def open_schema_editor(self):
        self._schema_editor = SchemaEditorWindow(self)
        self._schema_editor.show()

    def close_schema_editor(self):
        self._schema_editor.close()
        self._schema_editor = None


def _labeller_window(app, images_dir: pathlib.Path, labels_dir: Optional[pathlib.Path], schema_path: pathlib.Path,
                     readonly: bool, enable_dextr: bool, dextr_weights=Optional[pathlib.Path],
                     enable_firebug: bool = False, use_http_memory_cache: bool = False):
    from image_labelling_tool import labelled_image, labelling_tool, labelling_schema

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
                dextr_weights = dextr_weights.expanduser()
                dextr_model = torch.load(dextr_weights, map_location=device)
            else:
                dextr_model = DextrModel.pascalvoc_resunet101().to(device)

            # Evaluation mode
            dextr_model.eval()

            # Define a mask prediction function
            dextr_fn = lambda image, points: dextr_model.predict([image], points[None, :, :])[0] >= 0.5
        else:
            dextr_fn = None

        schema_store = labelling_schema.FileSchemaStore(schema_path, readonly=readonly)

        # Annotation controls
        # Labels may also have optional meta-data associated with them
        # You could use this for e.g. indicating if an object is fully visible, mostly visible or significantly obscured.
        # You could also indicate quality (e.g. blurriness, etc)
        # There are four types of annotation. They have some common properties:
        #   - name: symbolic name (Python identifier)
        #   - label_text: label text in UI
        #   Check boxes, radio buttons and popup menus also have:
        #     - visibility_label_text: [optional] if provided, label visibility can be filtered by this annotation value,
        #       in which case a drop down will appear in the UI allowing the user to select a filter value
        #       that will hide/show labels accordingly
        # Control types:
        # Check box (boolean value):
        #   `labelling_tool.AnnoControlCheckbox`; only the 3 common parameters listed above
        # Radio button (choice from a list):
        #   `labelling_tool.AnnoControlRadioButtons`; the 3 common parameters listed above and:
        #       choices: list of `labelling_tool.AnnoControlRadioButtons.choice` that provide:
        #           value: symbolic value name for choice
        #           tooltip: extra information for user
        #       label_on_own_line [optional]: if True, place the label and the buttons on a separate line in the UI
        # Popup menu (choice from a grouped list):
        #   `labelling_tool.AnnoControlPopupMenu`; the 3 common parameters listed above and:
        #       groups: list of groups `labelling_tool.AnnoControlPopupMenu.group`:
        #           label_text: label text in UI
        #           choices: list of `labelling_tool.AnnoControlPopupMenu.choice` that provide:
        #               value: symbolic value name for choice
        #               label_text: choice label text in UI
        #               tooltip: extra information for user
        # Text (free form plain text):
        #   `labelling_tool.AnnoControlText`; only the 2 common parameters listed above and:
        #       - multiline: boolean; if True a text area will be used, if False a single line text entry
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
            ], visibility_label_text='Filter by material'),
            # labelling_tool.AnnoControlText('comment', 'Comment', multiline=False),
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

        tool = Tool(server=server, labelled_images=labelled_images, schema_store=schema_store,
            tasks=tasks, anno_controls=anno_controls, config=config, dextr_fn=dextr_fn,
            enable_firebug=enable_firebug, use_http_memory_cache=use_http_memory_cache)

        # Show the window and run the app
        tool.open_labeller()

        app.exec_()
    finally:
        print('Stopping server')
        server.stop_server()


@click.command(context_settings=dict(ignore_unknown_options=True, allow_extra_args=True))
@click.option('--dextr_weights', type=click.Path())
@click.option('--enable_firebug', is_flag=True, default=False)
@click.option('--use_http_memory_cache', is_flag=True, default=False)
def run_app(dextr_weights, enable_firebug, use_http_memory_cache):
    import pathlib

    # Create an application
    app = QtWidgets.QApplication([])

    # Start with a dialog that allows the user to choose the images directory, optionally
    # a labels directory and read only checkbox
    init_dialog = QtWidgets.QDialog()
    init_dialog.setWindowTitle('Django-labeller for Qt')
    dia_layout = QtWidgets.QVBoxLayout()
    init_dialog.setLayout(dia_layout)

    # Content section
    content_section = QtWidgets.QFrame()
    dia_layout.addWidget(content_section)
    content_layout = QtWidgets.QGridLayout()
    content_section.setLayout(content_layout)

    images_dir = ['.']
    labels_dir = [None]
    schema_path = [None]

    # Images directory
    content_layout.addWidget(QtWidgets.QLabel('Please choose the directory containing the images that you wish to label:'),
                             0, 0, 1, 2)
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
    content_layout.addWidget(images_dir_button, 1, 0)
    content_layout.addWidget(images_dir_label, 1, 1)

    # Labels directory
    content_layout.addWidget(QtWidgets.QLabel('If the labels are in a different directory please choose it:'),
                             2, 0, 1, 2)
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
    content_layout.addWidget(labels_dir_button, 3, 0)
    content_layout.addWidget(labels_dir_label, 3, 1)

    # Schema path
    content_layout.addWidget(QtWidgets.QLabel('If the schema is not stored in the file schema.json alongside the labels, please choose its location:'),
                             4, 0, 1, 2)
    schema_path_button = QtWidgets.QPushButton('[Optional] Choose labels directory')
    schema_path_button.setIcon(init_dialog.style().standardIcon(QtWidgets.QStyle.SP_DirOpenIcon))
    schema_path_label = QtWidgets.QLabel('')

    def _on_schema_path_button():
        file_dialog = QtWidgets.QFileDialog(None, 'Choose schema path', '')
        # file_dialog.setFileMode(QtWidgets.QFileDialog.AnyFile)
        choice = file_dialog.exec()
        if choice == QtWidgets.QFileDialog.Accepted:
            schema_path[0] = file_dialog.selectedFiles()[0]
            schema_path_label.setText(schema_path[0])

    schema_path_button.clicked.connect(_on_schema_path_button)
    content_layout.addWidget(schema_path_button, 5, 0)
    content_layout.addWidget(schema_path_label, 5, 1)

    # Read only checkbox
    read_only_check = QtWidgets.QCheckBox('Read only')
    content_layout.addWidget(read_only_check, 6, 0)

    # DEXTR checkbox
    dextr_check = QtWidgets.QCheckBox('Enable DEXTR')
    content_layout.addWidget(dextr_check, 6, 1)


    # Buttons section
    buttons_section = QtWidgets.QFrame()
    dia_layout.addWidget(buttons_section)
    buttons_layout = QtWidgets.QHBoxLayout()
    buttons_section.setLayout(buttons_layout)

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

    buttons_layout.addWidget(ok_button)
    buttons_layout.addWidget(cancel_button)

    # Run the dialog
    action = init_dialog.exec()

    if action == QtWidgets.QDialog.Accepted:
        images_dir = pathlib.Path(images_dir[0])
        if labels_dir[0] is not None:
            labels_dir = pathlib.Path(labels_dir[0])
        else:
            labels_dir = None
        if schema_path[0] is not None:
            schema_path = pathlib.Path(schema_path[0])
        else:
            if labels_dir is not None:
                schema_path = labels_dir / 'schema.json'
            else:
                schema_path = images_dir / 'schema.json'
        enable_dextr = bool(dextr_check.checkState())
        readonly = bool(read_only_check.checkState())
        if dextr_weights is not None:
            dextr_weights = pathlib.Path(dextr_weights)

        _labeller_window(app, images_dir, labels_dir, schema_path, readonly, enable_dextr, dextr_weights=dextr_weights,
                         enable_firebug=enable_firebug, use_http_memory_cache=use_http_memory_cache)


if __name__ == '__main__':
    run_app()