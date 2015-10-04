import uuid, json

from django import template

register = template.Library()


@register.inclusion_tag('inline/labelling_tool.html')
def labelling_tool(width, height, label_classes, image_ids, initial_image_id,
                   get_image_descriptor_url, update_labels_url, config=None):
    tool_id = uuid.uuid4()
    if config is None:
        config = {}
    return {'tool_id': str(tool_id),
            'width': width,
            'height': height,
            'label_classes': json.dumps(label_classes),
            'image_ids': json.dumps(image_ids),
            'initial_image_id': str(initial_image_id),
            'get_image_descriptor_url': get_image_descriptor_url,
            'update_labels_url': update_labels_url,
            'config': json.dumps(config),
            }