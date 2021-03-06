# Generated by Django 3.1.7 on 2021-03-24 14:16

import django.core.validators
from django.db import migrations, models
import re


class Migration(migrations.Migration):

    dependencies = [
        ('image_labelling_tool', '0007_auto_20210322_1737'),
    ]

    operations = [
        migrations.AlterField(
            model_name='labelclass',
            name='name',
            field=models.CharField(max_length=64, validators=[django.core.validators.RegexValidator(re.compile('[a-zA-Z_][a-zA-Z0-9_]*'), message='Enter a valid identifier (letters or underscore, followedby letters, numbers or underscore')], verbose_name='Label class identifier name'),
        ),
        migrations.AlterField(
            model_name='labellingcolourscheme',
            name='name',
            field=models.CharField(max_length=64, validators=[django.core.validators.RegexValidator(re.compile('[a-zA-Z_][a-zA-Z0-9_]*'), message='Enter a valid identifier (letters or underscore, followedby letters, numbers or underscore')], verbose_name='Colour scheme identifier name'),
        ),
    ]
