def _jupyter_nbextension_paths():
    return [{
        'section': 'notebook',
        'src': 'static',
        'dest': 'image_labelling_tool',
        'require': 'image_labelling_tool/labelling_tool/extension'
    }]