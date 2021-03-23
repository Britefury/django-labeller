import os, mimetypes, json, datetime, re
import pickle
import tqdm
from django.core.management.base import BaseCommand, CommandError
from django.core.files import File
from django.db.models import Avg, Max, Min, Sum
from django.db import transaction
from image_labelling_tool import models






_EXAMPLE_LABEL_SCHEMA = {
    'colour_schemes': [
        {'name': 'natural', 'human_name': 'Natural'},
        {'name': 'artificial', 'human_name': 'Artificial'},
    ],
    'groups': [
        {'group_name': 'Natural', 'group_classes': [
            {'name': 'tree', 'human_name': 'Trees', 'colours': dict(default=[0, 255, 192], natural=[0, 255, 192],
                                                                    artificial=[128, 128, 128])},
            {'name': 'lake', 'human_name': 'Lake', 'colours': dict(default=[0, 128, 255], natural=[0, 128, 255],
                                                           artificial=[128, 128, 128])},
        ]},
        {'group_name': 'Artificial', 'group_classes': [

            {'name': 'building', 'human_name': 'Buldings', 'colours': dict(default=[255, 128, 0], natural=[128, 128, 128],
                                                                           artificial=[255, 128, 0])},
        ]},
    ]
}
class Command(BaseCommand):
    help = 'Import label classes from JSON file. Give \'default\' as the path to load the default label classes'

    def add_arguments(self, parser):
        parser.add_argument('path', type=str)
        parser.add_argument('--replace', action='store_true', dest='replace', help='Delete existing label classes')

    def handle(self, *args, **options):
        path = options['path']
        replace = options['replace']

        with transaction.atomic():
            if replace:
                for model in models.LabelClassColour.objects.all():
                    model.delete()

                for model in models.LabelClass.objects.all():
                    model.delete()

                for model in models.LabelClassGroup.objects.all():
                    model.delete()

                for model in models.LabellingColourScheme.objects.all():
                    model.delete()

            group_order_index = models.LabelClassGroup.objects.all().aggregate(Max('order_index'))['order_index__max']
            if group_order_index is None:
                group_order_index = 0
            else:
                group_order_index += 1
            lab_order_index = models.LabelClass.objects.all().aggregate(Max('order_index'))['order_index__max']
            if lab_order_index is None:
                lab_order_index = 0
            else:
                lab_order_index += 1

            if path == 'default':
                schema_js = _EXAMPLE_LABEL_SCHEMA
            else:
                with open(path, 'r') as f_in:
                    schema_js = json.load(f_in)

            groups_js = schema_js['groups']
            colour_schemes_js = schema_js['colour_schemes']

            id_to_scheme = {}

            for col_scheme in colour_schemes_js:
                col_scheme_model = models.LabellingColourScheme(
                    id_name=col_scheme['name'], human_name=col_scheme['human_name'], active=True)
                col_scheme_model.save()
                id_to_scheme[col_scheme['name']] = col_scheme_model


            for group in groups_js:
                group_model = models.LabelClassGroup(
                    human_name=group['group_name'], active=True, order_index=group_order_index)
                group_order_index += 1
                group_model.save()

                for lab in group['group_classes']:
                    lab_model = models.LabelClass(
                        group=group_model, id_name=lab['name'], human_name=lab['human_name'],
                        default_colour=models.LabelClass.list_to_html_colour(lab['colours']['default']),
                        active=True, order_index=lab_order_index)
                    lab_order_index += 1
                    lab_model.save()

                    for key, value in lab['colours'].items():
                        if key != 'default':
                            cls_col_model = models.LabelClassColour(label_class=lab_model, scheme=id_to_scheme[key],
                                                                    colour=models.LabelClass.list_to_html_colour(value))
                            cls_col_model.save()

