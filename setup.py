import os
from setuptools import find_packages
from setuptools import setup

version = '0.1.dev1'

here = os.path.abspath(os.path.dirname(__file__))
try:
    README = open(os.path.join(here, 'README.md')).read()
except IOError:
    README = ''

install_requires = [
    'numpy',
    'Pillow',
    'scikit-image'
    ]

tests_require = [
    ]

include_package_data = True
data_files = [
    ('image_labelling_tool/templates', [
        'image_labelling_tool/templates/labeller_page.jinja2'
    ]),
    ('image_labelling_tool/templates/inline', [
        'image_labelling_tool/templates/inline/anno_app.html',
        'image_labelling_tool/templates/inline/image_annotator.html',
        'image_labelling_tool/templates/inline/image_annotator_css.html',
        'image_labelling_tool/templates/inline/image_annotator_scripts.html',
    ]),
    ('share/jupyter/nbextensions/image_labelling_tool', [
        'image_labelling_tool/static/polyk.js',
        'image_labelling_tool/static/json2.js',
        'image_labelling_tool/static/d3.min.js',
        'image_labelling_tool/static/labelling_tool/abstract_label.js',
        'image_labelling_tool/static/labelling_tool/abstract_tool.js',
        'image_labelling_tool/static/labelling_tool/box_label.js',
        'image_labelling_tool/static/labelling_tool/composite_label.js',
        'image_labelling_tool/static/labelling_tool/extension.js',
        'image_labelling_tool/static/labelling_tool/group_label.js',
        'image_labelling_tool/static/labelling_tool/label_class.js',
        'image_labelling_tool/static/labelling_tool/main_anno.js',
        'image_labelling_tool/static/labelling_tool/math_primitives.js',
        'image_labelling_tool/static/labelling_tool/object_id_table.js',
        'image_labelling_tool/static/labelling_tool/point_label.js',
        'image_labelling_tool/static/labelling_tool/polygonal_label.js',
        'image_labelling_tool/static/labelling_tool/root_label_view.js',
        'image_labelling_tool/static/labelling_tool/select_tools.js',
        'image_labelling_tool/static/labelling_tool/widget.js',
    ]),
    ('etc/jupyter/nbconfig/notebook.d', [
        'enable_image_labelling_tool.json'
    ])

]

setup(
    name="Image labelling tool",
    version=version,
    description="A web-based labelling tool for Django, Flask and Jupyter notebook",
    long_description="\n\n".join([README]),
    classifiers=[
        "Development Status :: 1 - Alpha",
        "Intended Audience :: Developers",
        "Intended Audience :: Science/Research",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 2.7",
        "Programming Language :: Python :: 3.6",
        "Topic :: Software Development :: User Interfaces",
        ],
    keywords="",
    author="Geoffrey French",
    # author_email="brittix1023 at gmail dot com",
    url="https://bitbucket.org/ueacomputervision/image-labelling-tool",
    license="MIT",
    packages=find_packages(),
    include_package_data=include_package_data,
    data_files=data_files,
    zip_safe=False,
    install_requires=install_requires,
    extras_require={
        'testing': tests_require,
        },
    )
