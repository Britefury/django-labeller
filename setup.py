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
]

setup(
    name="Image labelling tool",
    version=version,
    description="A web-based labelling tool for Django and Flask",
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
