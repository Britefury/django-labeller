import os, mimetypes, json, datetime, re
import pickle
import tqdm
from django.core.management.base import BaseCommand, CommandError
from django.core.files import File
from django.db.models import Avg, Max, Min, Sum
from django.db import transaction
from image_labelling_tool import models


_DEMO_LABEL_SCHEMA = {
    'colour_schemes': [
        {'name': 'natural', 'human_name': 'Natural'},
        {'name': 'artificial', 'human_name': 'Artificial'},
    ],
    'label_class_groups': [
        {'group_name': 'Natural', 'group_classes': [
            {'name': 'tree', 'human_name': 'Trees', 'colours': dict(default=[0, 255, 192], natural=[0, 255, 192],
                                                                    artificial=[128, 128, 128])},
            {'name': 'lake', 'human_name': 'Lake', 'colours': dict(default=[0, 128, 255], natural=[0, 128, 255],
                                                                   artificial=[128, 128, 128])},
            {'name': 'flower', 'human_name': 'Flower', 'colours': dict(default=[255, 96, 192], natural=[255, 192, 96],
                                                                       artificial=[128, 128, 128])},
            {'name': 'leaf', 'human_name': 'Leaf', 'colours': dict(default=[65, 255, 0], natural=[65, 255, 0],
                                                                   artificial=[128, 128, 128])},
            {'name': 'stem', 'human_name': 'Stem', 'colours': dict(default=[128, 64, 0], natural=[128, 64, 0],
                                                                   artificial=[128, 128, 128])},
        ]},
        {'group_name': 'Artificial', 'group_classes': [
            {'name': 'building', 'human_name': 'Buildings', 'colours': dict(default=[255, 128, 0], natural=[128, 128, 128],
                                                                            artificial=[255, 128, 0])},
            {'name': 'wall', 'human_name': 'Wall', 'colours': dict(default=[0, 128, 255], natural=[128, 128, 128],
                                                                   artificial=[0, 128, 255])},
        ]},
    ]
}


class Command(BaseCommand):
    help = 'Import label classes from JSON file. Give \'default\' as the path to load the default label classes'

    def add_arguments(self, parser):
        parser.add_argument('schema_name', type=str)
        parser.add_argument('path', type=str)
        parser.add_argument('--replace', action='store_true', dest='replace', help='Delete existing label classes')

    def handle(self, *args, **options):
        schema_name = options['schema_name']
        path = options['path']
        replace = options['replace']

        with transaction.atomic():
            schema_models = models.LabellingSchema.objects.filter(name=schema_name)
            if schema_models.exists():
                schema_model = schema_models.first()
                print('Found existing schema; extending')
            else:
                print('Creating new schema named {}'.format(schema_name))
                schema_model = models.LabellingSchema(name=schema_name)
                schema_model.save()

            if replace:
                for model in models.LabelClassColour.objects.filter(label_class__group__schema=schema_model):
                    model.delete()

                for model in models.LabelClass.objects.filter(group__schema=schema_model):
                    model.delete()

                for model in models.LabelClassGroup.objects.filter(schema=schema_model):
                    model.delete()

                for model in models.LabellingColourScheme.objects.filter(schema=schema_model):
                    model.delete()

            col_scheme_order_index = models.LabellingColourScheme.objects.filter(schema=schema_model).aggregate(Max('order_index'))['order_index__max']
            if col_scheme_order_index is None:
                col_scheme_order_index = 0
            else:
                col_scheme_order_index += 1
            group_order_index = models.LabelClassGroup.objects.filter(schema=schema_model).aggregate(Max('order_index'))['order_index__max']
            if group_order_index is None:
                group_order_index = 0
            else:
                group_order_index += 1
            lab_order_index = models.LabelClass.objects.filter(group__schema=schema_model).aggregate(Max('order_index'))['order_index__max']
            if lab_order_index is None:
                lab_order_index = 0
            else:
                lab_order_index += 1

            if path == 'demo':
                schema_js = _DEMO_LABEL_SCHEMA
            else:
                with open(path, 'r') as f_in:
                    schema_js = json.load(f_in)

            groups_js = schema_js['label_class_groups']
            colour_schemes_js = schema_js['colour_schemes']

            name_to_colour_scheme = {}

            for col_scheme_js in colour_schemes_js:
                col_scheme_models = schema_model.colour_schemes.filter(name=col_scheme_js['name'])
                if col_scheme_models.exists():
                    # Update existing
                    col_scheme_model = col_scheme_models.first()
                    col_scheme_model.human_name = col_scheme_js['human_name']
                else:
                    # Create new
                    col_scheme_model = models.LabellingColourScheme(
                        schema=schema_model, name=col_scheme_js['name'], human_name=col_scheme_js['human_name'],
                        order_index=col_scheme_order_index)
                    col_scheme_order_index += 1
                col_scheme_model.save()
                name_to_colour_scheme[col_scheme_js['name']] = col_scheme_model

            for group_js in groups_js:
                group_models = schema_model.label_class_groups.filter(group_name=group_js['group_name'])
                if group_models.exists():
                    # Use existing
                    group_model = group_models.first()
                else:
                    # Create new
                    group_model = models.LabelClassGroup(
                        schema=schema_model, group_name=group_js['group_name'], order_index=group_order_index)
                    group_order_index += 1
                    group_model.save()

                for lab_js in group_js['group_classes']:
                    lab_models = models.LabelClass.objects.filter(group__schema=schema_model, name=lab_js['name'])
                    if lab_models.exists():
                        # Update existing
                        lab_model = lab_models.first()
                        lab_model.group = group_model
                        lab_model.human_name = lab_js['human_name']
                        lab_model.default_colour = models.LabelClass.list_to_html_colour(lab_js['colours']['default'])
                    else:
                        # Create new
                        lab_model = models.LabelClass(
                            group=group_model, name=lab_js['name'], human_name=lab_js['human_name'],
                            default_colour=models.LabelClass.list_to_html_colour(lab_js['colours']['default']),
                            order_index=lab_order_index)
                        lab_order_index += 1
                    lab_model.save()

                    for key, value in lab_js['colours'].items():
                        if key != 'default':
                            cls_col_models = models.LabelClassColour.objects.filter(
                                scheme=name_to_colour_scheme[key], label_class=lab_model)
                            if cls_col_models.exists():
                                # Update existing
                                cls_col_model = cls_col_models.first()
                                cls_col_model.colour = models.LabelClass.list_to_html_colour(value)
                            else:
                                # Create new
                                cls_col_model = models.LabelClassColour(
                                    label_class=lab_model, scheme=name_to_colour_scheme[key],
                                    colour=models.LabelClass.list_to_html_colour(value))
                            cls_col_model.save()

