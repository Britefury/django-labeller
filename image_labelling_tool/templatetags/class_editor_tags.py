import uuid, json

from django import template
from django.utils.html import format_html

from image_labelling_tool import labelling_tool as lt


register = template.Library()


@register.inclusion_tag('inline/class_editor.html')
def class_editor(colour_schemes, groups, update_url, form_url, class_editor_url, show_colour_scheme_editor=True):
    return {'colour_schemes': colour_schemes,
            'groups': groups,
            'update_url': update_url,
            'form_url': form_url,
            'class_editor_url': class_editor_url,
            'group_final_col_span': 2 + len(colour_schemes),
            'show_colour_scheme_editor': show_colour_scheme_editor,
            }
