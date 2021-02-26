import os
import fnmatch
from setuptools import find_packages
from setuptools import setup

version = '0.2.0'

here = os.path.abspath(os.path.dirname(__file__))
try:
    README = open(os.path.join(here, 'README.md')).read()
except IOError:
    README = ''

def find_data_files(dir, pat):
    files = []
    for f in os.listdir(dir):
        if fnmatch.fnmatch(f, pat):
            files.append(os.path.join(dir, f))
    return (dir, files)

install_requires = [
    'numpy',
    'Pillow',
    'scikit-image',
    'click',
    'flask',
    'deprecated'
]

tests_require = [
]

django_require = [
    'django'
]

dextr_require = [
    'dextr'
]

qt_require = [
    'PyQt5'
]

include_package_data = True
data_files = [
    ('image_labelling_tool/templates', [
        'image_labelling_tool/templates/labeller_page.jinja2'
    ]),
    ('image_labelling_tool/templates/inline', [
        'image_labelling_tool/templates/inline/labeller_app.html',
        'image_labelling_tool/templates/inline/image_labeller.html',
        'image_labelling_tool/templates/inline/image_labeller_css.html',
        'image_labelling_tool/templates/inline/image_labeller_scripts.html',
    ]),
    find_data_files('image_labelling_tool/static', '*.*'),
    find_data_files('image_labelling_tool/static/open-iconic/css', '*.*'),
    find_data_files('image_labelling_tool/static/open-iconic/fonts', '*.*'),
    find_data_files('image_labelling_tool/static/labelling_tool', '*.*'),
]

setup(
    name="django-labeller",
    version=version,
    description="An image labelling tool for creating segmentation data sets, for Django, Flask and Qt.",
    long_description="\n\n".join([README]),
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "Intended Audience :: Science/Research",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3.6",
        "Topic :: Software Development :: User Interfaces",
    ],
    keywords="",
    author="Geoff French",
    # author_email="brittix1023 at gmail dot com",
    url="https://github.com/Britefury/django-labeller",
    license="MIT",
    packages=find_packages(),
    include_package_data=include_package_data,
    data_files=data_files,
    zip_safe=False,
    install_requires=install_requires,
    extras_require={
        'testing': tests_require,
        'django': django_require,
        'dextr': dextr_require,
        'qt5': qt_require,
    },
)
