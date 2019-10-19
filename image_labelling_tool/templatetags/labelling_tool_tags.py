import uuid, json

from django import template
from django.utils.html import format_html

from image_labelling_tool import labelling_tool as lt

register = template.Library()


@register.filter(name='as_json')
def as_json(value):
    return json.dumps(value)


def _update_config(dest, src):
    if isinstance(src, dict):
        for key, value in src.items():
            if isinstance(value, dict) and isinstance(dest.get(key), dict):
                print('Updating {}...'.format(key))
                _update_config(dest[key], src[key])
            else:
                dest[key] = value


@register.inclusion_tag('inline/image_annotator.html', name='labelling_tool')
def labelling_tool(label_class_groups, image_descriptors, color_schemes, initial_image_index,
                    labelling_tool_url, enable_locking, config=None):
    if config is None:
        config = {}
    return {
        'colour_schemes': color_schemes,
        'label_class_groups': label_class_groups,
        'image_descriptors': image_descriptors,
        'num_images': len(image_descriptors),
        'initial_image_index': str(initial_image_index),
        'labelling_tool_url': labelling_tool_url,
        'enable_locking': enable_locking,
        'labelling_tool_config': config,
    }
