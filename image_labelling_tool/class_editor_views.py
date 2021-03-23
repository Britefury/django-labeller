import json
from django.http import JsonResponse, Http404
from django.shortcuts import render, redirect, get_object_or_404
from . import models

def _reorder(models, src_model, idx_dst):
    ids = [model.id for model in models]
    idx_src = ids.index(src_model.id)
    if idx_src != idx_dst and idx_dst <= len(models):
        del models[idx_src]
        models.insert(idx_dst, src_model)
        for i, model in enumerate(models):
            model.order_index = i
            model.save()


def update_label_classes(request):
    if request.method == 'POST':
        action = request.POST.get('action')
        params = json.loads(request.POST.get('params'))
        if action == 'group':
            group_id = params.get('group_id')
            active = params.get('active')
            human_name = params.get('human_name')
            if group_id is not None:
                try:
                    group_id = int(group_id)
                except ValueError:
                    pass
                else:
                    group = get_object_or_404(models.LabelClassGroup, id=group_id)
                    if active is not None:
                        group.active = active
                    if human_name is not None:
                        group.human_name = human_name
                    group.save()
            return JsonResponse({'status': 'success'})
        elif action == 'group_reorder':
            src_group_id = params.get('src_group_id')
            dst_index = params.get('dst_index')
            if src_group_id is not None and dst_index is not None:
                try:
                    src_group_id = int(src_group_id)
                    dst_index = int(dst_index)
                except ValueError:
                    pass
                else:
                    src_group = get_object_or_404(models.LabelClassGroup, id=src_group_id)
                    groups = list(models.LabelClassGroup.objects.order_by('order_index'))
                    _reorder(groups, src_group, dst_index)
            return JsonResponse({'status': 'success'})
        elif action == 'label_class':
            label_class_id = params.get('lcls_id')
            active = params.get('active')
            human_name = params.get('human_name')
            colour = params.get('colour')
            if label_class_id is not None:
                try:
                    label_class_id = int(label_class_id)
                except ValueError:
                    pass
                else:
                    label_class = get_object_or_404(models.LabelClass, id=label_class_id)
                    if active is not None:
                        label_class.active = active
                    if human_name is not None:
                        label_class.human_name = human_name
                    if colour is not None:
                        if colour['scheme'] == 'default':
                            label_class.default_colour = colour['colour']
                        else:
                            scheme_model = get_object_or_404(models.LabellingColourScheme, id_name=colour['scheme'])
                            label_colour = models.LabelClassColour.objects.get(
                                label_class=label_class, scheme=scheme_model)
                            if label_colour is None:
                                label_colour = models.LabelClassColour(
                                    label_class=label_class, scheme=scheme_model, colour=colour['colour'])
                                label_colour.save()
                            else:
                                label_colour.colour = colour['colour']
                            label_colour.save()
                    label_class.save()
            return JsonResponse({'status': 'success'})
        elif action == 'label_class_reorder':
            src_lcls_id = params.get('src_lcls_id')
            dst_index = params.get('dst_index')
            if src_lcls_id is not None and dst_index is not None:
                try:
                    src_lcls_id = int(src_lcls_id)
                    dst_index = int(dst_index)
                except ValueError:
                    pass
                else:
                    src_label_class = get_object_or_404(models.LabelClass, id=src_lcls_id)
                    dst_group = src_label_class.group
                    lcls_in_dst_group = list(dst_group.label_classes.order_by('order_index'))
                    _reorder(lcls_in_dst_group, src_label_class, dst_index)

            return JsonResponse({'status': 'success'})
        elif action == 'move_label_to_group':
            src_lcls_id = params.get('src_lcls_id')
            dst_group_id = params.get('dst_group_id')
            dst_index = params.get('dst_index')
            if src_lcls_id is not None and dst_group_id is not None:
                try:
                    src_lcls_id = int(src_lcls_id)
                    dst_group_id = int(dst_group_id)
                except ValueError:
                    pass
                else:
                    src_label_class = get_object_or_404(models.LabelClass, id=src_lcls_id)
                    dst_group = get_object_or_404(models.LabelClassGroup, id=dst_group_id)
                    lcls_in_dst_group = list(dst_group.label_classes.order_by('order_index'))

                    # Re-assign group
                    src_label_class.group = dst_group
                    lcls_in_dst_group.insert(dst_index, src_label_class)

                    for i, model in enumerate(lcls_in_dst_group):
                        model.order_index = i
                        model.save()

            return JsonResponse({'status': 'success'})
    return JsonResponse({'status': 'failed'})


def handle_class_editor_forms(request):
    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'new_class_label':
            group_id = request.POST.get('group_id')
            name = request.POST.get('name')
            human_name = request.POST.get('human_name')

            try:
                group_id = int(group_id)
            except ValueError:
                raise Http404

            group = models.LabelClassGroup.objects.get(id=group_id)
            order_index = len(group.label_classes.all())
            lcls = models.LabelClass(group=group, id_name=name, human_name=human_name,
                                     order_index=order_index)
            lcls.save()
        elif action == 'new_label_class_group':
            human_name = request.POST.get('human_name')

            order_index = len(models.LabelClassGroup.objects.all())

            group = models.LabelClassGroup(human_name=human_name, order_index=order_index)
            group.save()
        elif action == 'new_colour_scheme':
            name = request.POST.get('name')
            human_name = request.POST.get('human_name')

            scheme = models.LabellingColourScheme(id_name=name, human_name=human_name, active=True)
            scheme.save()

