import json
import re
from abc import abstractmethod
from django.db import transaction
from django.http import JsonResponse, Http404
from django.db.models import Avg, Max, Min, Sum
from django.views.decorators.cache import never_cache
from django.views import View
from django.utils.decorators import method_decorator
from . import models


_INT_REGEX = re.compile(r'[\d]+')
_UUID_REGEX = re.compile(r'\b[0-9a-f]{8}\b-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-\b[0-9a-f]{12}\b')


def _update_model_from_js(model, model_attr_name, value, save=False):
    if getattr(model, model_attr_name) != value:
        setattr(model, model_attr_name, value)
        return True
    else:
        return save or False


class SchemaEditorView (View):
    """
    Scheme editor class based view

    Subclass and override the `get_schema` method (mandatory).

    `get_schema` should return a `models.LabellingSchema` instance.

    Example in which the URL pattern places a schema ID in the `schema_id` keyword argument:
    >>> class MyLabelView (LabellingToolView):
    ...     def get_schema(self, request, *args, **kwargs):
    ...         return models.LabellingSchema.objects.get(id=kwargs['schema_id'])
    """
    @abstractmethod
    def get_schema(self, request, *args, **kwargs):
        pass

    def update_schema(self, request, schema, params):
        """Update all models in a given schema

        :param request: request
        :param schema: a `models.LabellingSchema` instance
        :param params: JSON representation of method parameters
        :return: JSON response
        """
        colour_scheme_id_mapping = {}
        group_id_mapping = {}
        label_class_id_mapping = {}
        schema_js = params['schema']
        with transaction.atomic():
            colour_schemes_js = schema_js.get('colour_schemes', [])
            label_class_groups_js = schema_js.get('label_class_groups', [])

            # Handle colour schemes
            for scheme_i, scheme_js in enumerate(colour_schemes_js):
                if isinstance(scheme_js['id'], str) and _UUID_REGEX.fullmatch(scheme_js['id']) is not None:
                    # New colour scheme
                    scheme_model = models.LabellingColourScheme(
                        schema=schema, name=scheme_js['name'], human_name=scheme_js['human_name'],
                        order_index=scheme_i)
                    scheme_model.save()
                    colour_scheme_id_mapping[scheme_js['id']] = scheme_model.id
                elif isinstance(scheme_js['id'], int):
                    try:
                        scheme_model = models.LabellingColourScheme.objects.get(schema=schema, id=scheme_js['id'])
                    except models.LabellingColourScheme.DoesNotExist:
                        print('WARNING: could not find colour scheme for schema={}, id={}'.format(
                            schema.name, id=scheme_js['id']
                        ))
                        scheme_model = None
                    else:
                        save = _update_model_from_js(scheme_model, 'order_index', scheme_i)
                        save = _update_model_from_js(scheme_model, 'human_name', scheme_js['human_name'], save)
                        if save:
                            scheme_model.save()
                else:
                    # No ID, ignore
                    pass

            # Handle label class groups
            for group_i, group_js in enumerate(label_class_groups_js):
                if isinstance(group_js['id'], str) and _UUID_REGEX.fullmatch(group_js['id']) is not None:
                    # New group
                    group_model = models.LabelClassGroup(
                        schema=schema, group_name=group_js['group_name'], order_index=group_i)
                    group_model.save()
                    group_id_mapping[group_js['id']] = group_model.id
                elif isinstance(group_js['id'], int):
                    try:
                        group_model = models.LabelClassGroup.objects.get(schema=schema, id=group_js['id'])
                    except models.LabelClassGroup.DoesNotExist:
                        print('WARNING: could not find group for schema={}, id={}'.format(
                            schema.name, id=group_js['id']
                        ))
                        group_model = None
                    else:
                        save = _update_model_from_js(group_model, 'order_index', group_i)
                        save = _update_model_from_js(group_model, 'group_name', group_js['group_name'], save)
                        if save:
                            group_model.save()
                else:
                    group_model = None

                if group_model is not None:
                    for lcls_i, lcls_js in enumerate(group_js['group_classes']):
                        if isinstance(lcls_js['id'], str) and _UUID_REGEX.fullmatch(lcls_js['id']) is not None:
                            # New colour scheme
                            default_col_html = models.LabelClass.list_to_html_colour(lcls_js['colours']['default'])
                            lcls_model = models.LabelClass(
                                group=group_model, name=lcls_js['name'], order_index=lcls_i,
                                human_name=lcls_js['human_name'], default_colour=default_col_html)
                            lcls_model.save()
                            label_class_id_mapping[lcls_js['id']] = lcls_model.id
                        elif isinstance(lcls_js['id'], int):
                            try:
                                lcls_model = models.LabelClass.objects.get(group__schema=schema, id=lcls_js['id'])
                            except models.LabelClass.DoesNotExist:
                                print('WARNING: could not find label class for schema={}, id={}'.format(
                                    schema.name, id=lcls_js['id']
                                ))
                                lcls_model = None
                            else:
                                default_col_html = models.LabelClass.list_to_html_colour(lcls_js['colours']['default'])
                                save = _update_model_from_js(lcls_model, 'order_index', lcls_i)
                                save = _update_model_from_js(lcls_model, 'group', group_model, save)
                                save = _update_model_from_js(lcls_model, 'human_name', lcls_js['human_name'], save)
                                save = _update_model_from_js(lcls_model, 'default_colour', default_col_html, save)
                                if save:
                                    lcls_model.save()
                        else:
                            lcls_model = None

                        if lcls_model is not None:
                            self._update_label_class_scheme_colours(schema, lcls_model, lcls_js['colours'])

        return {'status': 'success',
                'colour_scheme_id_mapping': colour_scheme_id_mapping,
                'group_id_mapping': group_id_mapping,
                'label_class_id_mapping': label_class_id_mapping
                }

    def _update_label_class_scheme_colours(self, schema, lcls_model, colours_dict_js):
        for col_scheme_name, col_js in colours_dict_js.items():
            if col_scheme_name != 'default':
                col_models = models.LabelClassColour.objects.filter(
                    label_class=lcls_model, scheme__name=col_scheme_name)
                if col_models.exists():
                    # Existing class-colour; update
                    col_model = col_models.first()
                    col_html = models.LabelClass.list_to_html_colour(col_js)
                    save = _update_model_from_js(col_model, 'colour', col_html)
                    if save:
                        col_model.save()
                else:
                    # No existing class-colour; find the colour scheme and create new class class-colour
                    scheme_models = models.LabellingColourScheme.objects.filter(schema=schema, name=col_scheme_name)
                    if scheme_models.exists():
                        col_html = models.LabelClass.list_to_html_colour(col_js)
                        col_model = models.LabelClassColour(
                            label_class=lcls_model, scheme=scheme_models.first(), colour=col_html)
                        col_model.save()

    def create_colour_scheme(self, request, schema, params):
        colour_scheme_js = params['colour_scheme']
        if schema.colour_schemes.filter(name=colour_scheme_js['name']).exists():
            # Duplicate name
            return {'status': 'name_in_use'}
        last_order_index = schema.colour_schemes.aggregate(Max('order_index'))['order_index__max']
        if last_order_index is None:
            last_order_index = 0
        colour_scheme = models.LabellingColourScheme(
            schema=schema, name=colour_scheme_js['name'], human_name=colour_scheme_js['human_name'],
            order_index=last_order_index + 1)
        colour_scheme.save()
        return {'status': 'success', 'new_colour_scheme_id': colour_scheme.id}

    def delete_colour_scheme(self, request, schema, params):
        colour_scheme_js = params['colour_scheme']
        try:
            col_scheme = schema.colour_schemes.get(id=colour_scheme_js['id'])
        except models.LabellingColourScheme.DoesNotExist:
            return {'status': 'could_not_find'}
        else:
            # Delete all class-colours that reference this colour scheme
            models.LabelClassColour.objects.filter(scheme=col_scheme).delete()
            # Now delete the colour scheme
            col_scheme.delete()
            return {'status': 'success', }

    def create_group(self, request, schema, params):
        group_js = params['group']
        last_order_index = schema.label_class_groups.aggregate(Max('order_index'))['order_index__max']
        if last_order_index is None:
            last_order_index = 0
        group = models.LabelClassGroup(
            schema=schema, group_name=group_js['group_name'],
            order_index=last_order_index + 1)
        group.save()
        return {'status': 'success', 'new_group_id': group.id}

    def delete_group(self, request, schema, params):
        group_js = params['group']
        try:
            group = schema.label_class_groups.get(id=group_js['id'])
        except models.LabelClassGroup.DoesNotExist:
            return {'status': 'could_not_find'}
        else:
            if len(group.group_classes.all()) == 0:
                group.delete()
                return {'status': 'success'}
            else:
                return {'status': 'group_not_empty'}

    def create_label_class(self, request, schema, params):
        with transaction.atomic():
            lcls_js = params['label_class']
            if models.LabelClass.objects.filter(group__schema=schema, name=lcls_js['name']).exists():
                # Duplicate name
                return {'status': 'name_in_use'}
            containing_group_js = params['containing_group']
            try:
                containing_group = schema.label_class_groups.get(id=containing_group_js['id'])
            except models.LabelClassGroup.DoesNotExist:
                return {'status': 'could_not_find_containing_group'}
            else:
                last_order_index = containing_group.group_classes.aggregate(Max('order_index'))['order_index__max']
                if last_order_index is None:
                    last_order_index = 0
                default_col_html = models.LabelClass.list_to_html_colour(lcls_js['colours']['default'])
                label_class = models.LabelClass(
                    group=containing_group, name=lcls_js['name'], human_name=lcls_js['human_name'],
                    default_colour=default_col_html, order_index=last_order_index + 1)
                label_class.save()
                self._update_label_class_scheme_colours(schema, label_class, lcls_js['colours'])
                return {'status': 'success', 'new_label_class_id': label_class.id}

    def delete_label_class(self, request, schema, params):
        lcls_js = params['label_class']
        try:
            label_class = models.LabelClass.objects.get(group__schema=schema, id=lcls_js['id'])
        except models.LabelClass.DoesNotExist:
            return {'status': 'could_not_find'}
        else:
            # Delete all class-colours that reference this colour scheme
            models.LabelClassColour.objects.filter(label_class=label_class).delete()
            # Now delete the label class
            label_class.delete()
            return {'status': 'success', }

    @method_decorator(never_cache)
    def post(self, request, *args, **kwargs):
        messages = json.loads(request.POST.get('messages'))

        schema = self.get_schema(request, *args, **kwargs)

        responses = []
        for message in messages:
            method = message['method']
            params = message['params']
            if method == 'update_schema':
                response = self.update_schema(request, schema, params)
            elif method == 'create_colour_scheme':
                response = self.create_colour_scheme(request, schema, params)
            elif method == 'delete_colour_scheme':
                response = self.delete_colour_scheme(request, schema, params)
            elif method == 'create_group':
                response = self.create_group(request, schema, params)
            elif method == 'delete_group':
                response = self.delete_group(request, schema, params)
            elif method == 'create_label_class':
                response = self.create_label_class(request, schema, params)
            elif method == 'delete_label_class':
                response = self.delete_label_class(request, schema, params)
            else:
                response = {'status': 'unknown_method'}
            responses.append(response)

        return JsonResponse({'responses': responses})
