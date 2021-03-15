from unittest import TestCase
from . import labelling_tool


class LabelClassTestCase(TestCase):
    def test_constructor_simple(self):
        metal = labelling_tool.LabelClass('metal', 'Metal')
        self.assertEqual(metal.name, 'metal')
        self.assertEqual(metal.human_name, 'Metal')
        self.assertIsNone(metal.colours)

    def test_constructor_colour(self):
        metal = labelling_tool.LabelClass('metal', 'Metal', colour=(1, 2, 3))
        self.assertEqual(metal.name, 'metal')
        self.assertEqual(metal.human_name, 'Metal')
        self.assertEqual(metal.colours, {'default': [1, 2, 3]})

        metal = labelling_tool.LabelClass('metal', 'Metal', colour=[1, 2, 3])
        self.assertEqual(metal.name, 'metal')
        self.assertEqual(metal.human_name, 'Metal')
        self.assertEqual(metal.colours, {'default': [1, 2, 3]})

    def test_constructor_colours(self):
        metal = labelling_tool.LabelClass('metal', 'Metal', colours={'basic': (1, 2, 3), 'more': [2, 3, 4]})
        self.assertEqual(metal.name, 'metal')
        self.assertEqual(metal.human_name, 'Metal')
        self.assertEqual(metal.colours, {'basic': [1, 2, 3], 'more': [2, 3, 4]})

    def test_constructor_colours_bad(self):
        self.assertRaises(TypeError,
                          lambda: labelling_tool.LabelClass('metal', 'Metal', colour=(1, 2, 3),
                                                            colours={'basic': (1, 2, 3), 'more': (2, 3, 4)}))

    def test_to_json(self):
        metal_a = labelling_tool.LabelClass('metal', 'Metal')
        self.assertEqual(metal_a.to_json(), dict(name='metal', human_name='Metal', colours=None))
        metal_b = labelling_tool.LabelClass('metal', 'Metal', colours={'basic': (1, 2, 3), 'more': [2, 3, 4]})
        self.assertEqual(metal_b.to_json(), dict(name='metal', human_name='Metal',
                                                 colours={'basic': [1, 2, 3], 'more': [2, 3, 4]}))


class LabelClassGroupTestCase(TestCase):
    def test_constructor(self):
        metal = labelling_tool.LabelClass('metal', 'Metal')
        wood = labelling_tool.LabelClass('wood', 'Wood')
        group = labelling_tool.LabelClassGroup('Materials', [metal, wood])
        self.assertEqual(group.group_name, 'Materials')
        self.assertEqual(group.classes, [metal, wood])

    def test_to_json(self):
        metal = labelling_tool.LabelClass('metal', 'Metal')
        wood = labelling_tool.LabelClass('wood', 'Wood')
        group = labelling_tool.LabelClassGroup('Materials', [metal, wood])
        self.assertEqual(group.to_json(),
            dict(group_name='Materials', group_classes=[dict(name='metal', human_name='Metal', colours=None),
                                                        dict(name='wood', human_name='Wood', colours=None)]))
