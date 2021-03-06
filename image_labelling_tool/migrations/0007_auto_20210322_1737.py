# Generated by Django 3.1.7 on 2021-03-22 17:37

import django.core.validators
from django.db import migrations, models
import django.db.models.deletion
import re


class Migration(migrations.Migration):

    dependencies = [
        ('image_labelling_tool', '0006_remove_labels_complete'),
    ]

    operations = [
        migrations.CreateModel(
            name='LabelClass',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=64, unique=True, validators=[django.core.validators.RegexValidator(re.compile('[a-zA-Z_][a-zA-Z0-9_]*'), message='Enter a valid identifier (letters or underscore, followedby letters, numbers or underscore')], verbose_name='Species identifier name')),
                ('human_name', models.CharField(default='', max_length=64)),
                ('default_colour', models.CharField(default='#0080ff', max_length=8)),
                ('order_index', models.IntegerField(default=0)),
            ],
        ),
        migrations.CreateModel(
            name='LabellingSchema',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(default='', max_length=256)),
                ('description', models.TextField(blank=True, default='')),
            ],
        ),
        migrations.CreateModel(
            name='LabellingColourScheme',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=64, unique=True, validators=[django.core.validators.RegexValidator(re.compile('[a-zA-Z_][a-zA-Z0-9_]*'), message='Enter a valid identifier (letters or underscore, followedby letters, numbers or underscore')], verbose_name='Identifier used within tool')),
                ('human_name', models.CharField(default='', max_length=64, verbose_name='Name of colour scheme as shown in UI')),
                ('order_index', models.IntegerField(default=0)),
                ('schema', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='colour_schemes', to='image_labelling_tool.labellingschema')),
            ],
        ),
        migrations.CreateModel(
            name='LabelClassGroup',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('group_name', models.CharField(default='', max_length=64, verbose_name='Name of label class group as shown in UI')),
                ('order_index', models.IntegerField(default=0)),
                ('schema', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='label_class_groups', to='image_labelling_tool.labellingschema')),
            ],
        ),
        migrations.CreateModel(
            name='LabelClassColour',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('colour', models.CharField(default='#0080ff', max_length=8)),
                ('label_class', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='scheme_colours', to='image_labelling_tool.labelclass')),
                ('scheme', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='label_class_colours', to='image_labelling_tool.labellingcolourscheme')),
            ],
        ),
        migrations.AddField(
            model_name='labelclass',
            name='group',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='group_classes', to='image_labelling_tool.labelclassgroup'),
        ),
    ]
