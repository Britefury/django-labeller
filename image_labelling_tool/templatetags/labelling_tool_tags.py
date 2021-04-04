import uuid, json

from django import template
from django.utils.html import format_html

from image_labelling_tool import labelling_tool as lt
from image_labelling_tool import models as lt_models

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


@register.inclusion_tag('inline/image_labeller.html', name='labelling_tool')
def labelling_tool(image_descriptors, labelling_schema, initial_image_index,
                   labelling_tool_url, tasks=None, anno_controls=None, enable_locking=False, dextr_available=False, dextr_polling_interval=None,
                   config=None):
    if config is None:
        config = {}
    if dextr_polling_interval is not None:
        dextr_polling_interval = str(dextr_polling_interval)
    else:
        dextr_polling_interval = 'null'

    if anno_controls is None:
        anno_controls = []

    if tasks is None:
        tasks_json = [dict(identifier='finished', human_name='Finished')]
    else:
        tasks_json = []
        for task in tasks:
            if isinstance(task, dict):
                tasks_json.append(task)
            elif isinstance(task, lt_models.LabellingTask):
                tasks_json.append(task.to_json())
            else:
                raise TypeError('tasks should be an iterable of JSON dictionaries or '
                                'LabellingTask instances, not {}'.format(type(task)))

    return {
        'labelling_schema': labelling_schema,
        'tasks': tasks_json,
        'anno_controls': anno_controls,
        'image_descriptors': image_descriptors,
        'num_images': len(image_descriptors),
        'initial_image_index': str(initial_image_index),
        'labelling_tool_url': labelling_tool_url,
        'enable_locking': enable_locking,
        'dextr_available': dextr_available,
        'dextr_polling_interval': dextr_polling_interval,
        'labelling_tool_config': config,
    }
