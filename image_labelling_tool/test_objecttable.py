from typing import Union
from unittest import TestCase
from . import labelling_tool


class ObjectTableTestCase(TestCase):
    class MyObject:
        def __init__(self, obj_id: Union[str, int]=None):
            self.object_id = obj_id

    def test_simple(self):
        tbl = labelling_tool.ObjectTable(None)
        a = self.MyObject()
        tbl.register(a)
        self.assertEqual(a.object_id, '{}__{}'.format(tbl._id_prefix, 1))

    def test_prefix_autoinc(self):
        tbl = labelling_tool.ObjectTable('testprefix')
        # Create objects with blank object IDs and check they are assigned IDs with auto-incrementing indices
        a = self.MyObject()
        b = self.MyObject()
        tbl.register(a)
        tbl.register(b)
        self.assertEqual(a.object_id, 'testprefix__1')
        self.assertEqual(b.object_id, 'testprefix__2')
        self.assertEqual(tbl._next_object_idx, 3)

    def test_prefix_reregister(self):
        tbl = labelling_tool.ObjectTable('testprefix')
        # Create objects with blank object IDs and check they are assigned IDs with auto-incrementing indices
        a = self.MyObject()
        b = self.MyObject()
        tbl.register(a)
        tbl.register(b)
        tbl.register(b)
        self.assertEqual(b.object_id, 'testprefix__2')

    def test_register_convert(self):
        tbl = labelling_tool.ObjectTable(None)
        # Convert old-style integer object ID to new style string '<prefix>__<index>' ID
        a = self.MyObject(12345)
        tbl.register(a)
        self.assertEqual(a.object_id, '{}__{}'.format(tbl._id_prefix, 12345))

    def test_register_duplicate(self):
        tbl = labelling_tool.ObjectTable(None)
        a = self.MyObject('abc_123')
        b = self.MyObject('abc_1234')
        c = self.MyObject('abc_1234')
        tbl.register(a)
        self.assertEqual(a.object_id, 'abc_123')
        tbl.register(b)
        self.assertEqual(b.object_id, 'abc_1234')
        self.assertRaises(ValueError, lambda: tbl.register(c))

    def test_accessors(self):
        tbl = labelling_tool.ObjectTable('xyz')
        a = self.MyObject('abc_123')
        b = self.MyObject('abc_1234')
        tbl.register(a)
        tbl.register(b)
        self.assertIs(tbl.get('abc_123'), a)
        self.assertIs(tbl.get('abc_1234'), b)
        self.assertIsNone(tbl.get(None))
        self.assertIsNone(tbl.get('xyz_789'))
        self.assertIs(tbl['abc_123'], a)
        self.assertIs(tbl['abc_1234'], b)
        self.assertIsNone(tbl[None])
        self.assertRaises(KeyError, lambda: tbl['xyz_789'])
        self.assertTrue('abc_123' in tbl)
        self.assertTrue('abc_1234' in tbl)
        self.assertFalse(None in tbl)
        self.assertFalse('xyz_789' in tbl)

    def test_new_style_id(self):
        tbl = labelling_tool.ObjectTable('pqr')
        self.assertIsNone(tbl._new_style_id(None))
        self.assertEqual(tbl._new_style_id('abc_123'), 'abc_123')
        self.assertEqual(tbl._new_style_id(123), 'pqr__123')


