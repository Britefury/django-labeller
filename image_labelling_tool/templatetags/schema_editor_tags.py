import json
import pathlib

from django import template
from django.utils.html import format_html

from image_labelling_tool import labelling_tool as lt

SCHEMA_EDITOR_VUE_PATH = \
    pathlib.Path(__file__).parent.parent / 'templates' / 'inline' / 'schema_editor_vue_templates.html'

register = template.Library()

@register.inclusion_tag('inline/schema_editor.html')
def schema_editor(schema, update_url, show_colour_scheme_editor=True):
    schema_js = schema.json_for_tool()
    schema_editor_templates = SCHEMA_EDITOR_VUE_PATH.open('r').read()
    return {
        'schema': json.dumps(schema_js),
        'update_url': update_url,
        'show_colour_scheme_editor': show_colour_scheme_editor,
        'schema_editor_vue_templates_html': schema_editor_templates,
    }
