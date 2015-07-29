import uuid, json

from django import template

register = template.Library()


@register.inclusion_tag('inline/labelling_tool.html')
def labelling_tool(label_classes, image_ids, initial_image_id, get_image_descriptor_url, update_labels_url):
    tool_id = uuid.uuid4()
    return {'tool_id': str(tool_id),
            'label_classes': json.dumps(label_classes),
            'image_ids': json.dumps(image_ids),
            'initial_image_id': str(initial_image_id),
            'get_image_descriptor_url': get_image_descriptor_url,
            'update_labels_url': update_labels_url,
            }