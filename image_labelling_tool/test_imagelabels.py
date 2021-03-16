import math
import numpy as np
from PIL import Image, ImageDraw
from unittest import TestCase
from . import labelling_tool


class AbstractLabelTestCase(TestCase):
    def test_constructor(self):
        a = labelling_tool.AbstractLabel()
        b = labelling_tool.AbstractLabel(object_id='abc_123', classification='cls_a',
                                         source='manual', anno_data={'purpose': 'test'})
        self.assertIsNone(a.object_id)
        self.assertEqual(b.object_id, 'abc_123')
        self.assertIsNone(a.classification)
        self.assertEqual(b.classification, 'cls_a')
        self.assertIsNone(a.source)
        self.assertEqual(b.source, 'manual')
        self.assertEqual(a.anno_data, {})
        self.assertEqual(b.anno_data, {'purpose': 'test'})

    def test_dependencies(self):
        a = labelling_tool.AbstractLabel()
        self.assertEqual(a.dependencies, [])

    def test_flatten(self):
        a = labelling_tool.AbstractLabel()
        self.assertEqual(list(a.flatten()), [a])

    def test_accumulate_label_class_histogram(self):
        a = labelling_tool.AbstractLabel()
        b = labelling_tool.AbstractLabel(object_id='abc_123', classification='cls_a',
                                         source='manual', anno_data={'purpose': 'test'})
        h1 = {}
        a.accumulate_label_class_histogram(h1)
        self.assertEqual(h1, {None: 1})
        h2 = {}
        b.accumulate_label_class_histogram(h2)
        self.assertEqual(h2, {'cls_a': 1})
        b.accumulate_label_class_histogram(h2)
        self.assertEqual(h2, {'cls_a': 2})


class PointLabelTestCase(TestCase):
    def test_constructor(self):
        a = labelling_tool.PointLabel(position_xy=np.array([-1.0, 1.0]))
        b = labelling_tool.PointLabel(position_xy=np.array([1.0, 2.0]), object_id='abc_123', classification='cls_a',
                                      source='manual', anno_data={'purpose': 'test'})
        c = labelling_tool.PointLabel(position_xy=np.array([2.0, 4.0]), classification='cls_b',
                                      source='auto:test', anno_data={'purpose': 'second_test'})
        self.assertTrue((a.position_xy == np.array([-1.0, 1.0])).all())
        self.assertTrue((b.position_xy == np.array([1.0, 2.0])).all())
        self.assertTrue((c.position_xy == np.array([2.0, 4.0])).all())
        self.assertIsNone(a.object_id)
        self.assertEqual(b.object_id, 'abc_123')
        self.assertIsNone(c.object_id)
        self.assertIsNone(a.classification)
        self.assertEqual(b.classification, 'cls_a')
        self.assertEqual(c.classification, 'cls_b')
        self.assertIsNone(a.source)
        self.assertEqual(b.source, 'manual')
        self.assertEqual(c.source, 'auto:test')
        self.assertEqual(a.anno_data, {})
        self.assertEqual(b.anno_data, {'purpose': 'test'})
        self.assertEqual(c.anno_data, {'purpose': 'second_test'})

    def test_bounding_box(self):
        rad01 = labelling_tool.LabelContext(point_radius=0.1)
        a = labelling_tool.PointLabel(position_xy=np.array([-1.0, 1.0]))
        self.assertTrue((a.bounding_box()[0] == np.array([-1.0, 1.0])).all())
        self.assertTrue((a.bounding_box()[1] == np.array([-1.0, 1.0])).all())
        self.assertTrue((a.bounding_box(rad01)[0] == np.array([-1.1, 0.9])).all())
        self.assertTrue((a.bounding_box(rad01)[1] == np.array([-0.9, 1.1])).all())

    def test_warped(self):
        obj_tab = labelling_tool.ObjectTable('abc')
        a = labelling_tool.PointLabel(position_xy=np.array([-1.0, 1.0]))
        a_7 = a.warped(lambda p_xy: p_xy + 7.0)
        a_7b = a.warped(lambda p_xy: p_xy + 7.0, object_table=obj_tab)
        a_7c = a.warped(lambda p_xy: p_xy + 7.0, id_prefix='abc')
        self.assertTrue((a.position_xy == np.array([-1.0, 1.0])).all())
        self.assertTrue((a_7.position_xy == np.array([6.0, 8.0])).all())
        self.assertTrue((a_7b.position_xy == np.array([6.0, 8.0])).all())
        self.assertIsNone(a.object_id)
        self.assertTrue(a_7.object_id.endswith('__1'))
        self.assertEqual(a_7b.object_id, 'abc__1')
        self.assertEqual(a_7c.object_id, 'abc__1')

    def test_render_mask(self):
        rad10 = labelling_tool.LabelContext(point_radius=10.0)
        a = labelling_tool.PointLabel(position_xy=np.array([25.0, 25.0]))
        # Point
        tgt_point = Image.new('L', (50, 50), 0)
        ImageDraw.Draw(tgt_point).point((25, 25), fill=1)
        self.assertTrue((a.render_mask(50, 50, fill=False, dx=0.0, dy=0.0, ctx=None) ==
                         np.array(tgt_point)).all())
        self.assertTrue((a.render_mask(50, 50, fill=True, dx=0.0, dy=0.0, ctx=None) ==
                         np.array(tgt_point)).all())
        # Radius 10 outlined
        tgt_rad10_outline = Image.new('L', (50, 50), 0)
        ImageDraw.Draw(tgt_rad10_outline).ellipse([15, 15, 35, 35], outline=1, fill=0)
        self.assertTrue((a.render_mask(50, 50, fill=False, dx=0.0, dy=0.0, ctx=rad10) ==
                         np.array(tgt_rad10_outline)).all())
        # Radius 10 filled
        tgt_rad10_filled = Image.new('L', (50, 50), 0)
        ImageDraw.Draw(tgt_rad10_filled).ellipse([15, 15, 35, 35], outline=1, fill=1)
        self.assertTrue((a.render_mask(50, 50, fill=True, dx=0.0, dy=0.0, ctx=rad10) ==
                         np.array(tgt_rad10_filled)).all())
        # Point, offset
        tgt_point_dxy = Image.new('L', (50, 50), 0)
        ImageDraw.Draw(tgt_point_dxy).point((20, 30), fill=1)
        self.assertTrue((a.render_mask(50, 50, fill=False, dx=-5.0, dy=5.0, ctx=None) ==
                         np.array(tgt_point_dxy)).all())
        # Radius 10 filled, offset
        tgt_rad10_filled_dxy = Image.new('L', (50, 50), 0)
        ImageDraw.Draw(tgt_rad10_filled_dxy).ellipse([10, 20, 30, 40], outline=1, fill=1)
        self.assertTrue((a.render_mask(50, 50, fill=True, dx=-5.0, dy=5.0, ctx=rad10) ==
                         np.array(tgt_rad10_filled_dxy)).all())

    def test_to_json(self):
        b = labelling_tool.PointLabel(position_xy=np.array([1.0, 2.0]), object_id='abc_123', classification='cls_a',
                                      source='manual', anno_data={'purpose': 'test'})
        self.assertEqual(b.to_json(),
                         dict(label_type='point', position={'x': 1.0, 'y': 2.0}, object_id='abc_123',
                              label_class='cls_a', source='manual', anno_data={'purpose': 'test'}))

    def test_from_json(self):
        obj_tab = labelling_tool.ObjectTable('abc')
        js = dict(label_type='point', position={'x': 1.0, 'y': 2.0}, object_id='abc_123',
                  label_class='cls_a', source='manual', anno_data={'purpose': 'test'})
        b = labelling_tool.AbstractLabel.from_json(js, obj_tab)
        self.assertTrue(isinstance(b, labelling_tool.PointLabel))
        self.assertTrue((b.position_xy == np.array([1.0, 2.0])).all())
        self.assertEqual(b.object_id, 'abc_123')
        self.assertEqual(b.classification, 'cls_a')
        self.assertEqual(b.source, 'manual')
        self.assertEqual(b.anno_data, {'purpose': 'test'})


class PolygonLabelTestCase(TestCase):
    def are_polygons_cyclically_equal(self, a, b, both_directions=False):
        if len(a) == len(b):
            for i in range(len(a)):
                if (a == np.append(b[i:], b[:i], axis=0)).all():
                    return True
            if both_directions:
                a = a[::-1]
                for i in range(len(a)):
                    if (a == np.append(b[i:], b[:i], axis=0)).all():
                        return True
        return False

    def test_constructor(self):
        outer_rect = np.array([[10.0, 10.0], [40.0, 10.0], [40.0, 40.0], [10.0, 40.0]])
        inner_rect = np.array([[20.0, 20.0], [30.0, 20.0], [30.0, 30.0], [20.0, 30.0]])
        a = labelling_tool.PolygonLabel(regions=[inner_rect], object_id='abc_123', classification='cls_a',
                                        source='manual', anno_data={'purpose': 'test'})
        b = labelling_tool.PolygonLabel(regions=[outer_rect, inner_rect], object_id='abc_123', classification='cls_a',
                                        source='manual', anno_data={'purpose': 'test'})
        self.assertEqual(len(a.regions), 1)
        self.assertTrue((a.regions[0] == inner_rect).all())
        self.assertEqual(len(b.regions), 2)
        self.assertTrue((b.regions[0] == outer_rect).all())
        self.assertTrue((b.regions[1] == inner_rect).all())
        self.assertEqual(b.object_id, 'abc_123')
        self.assertEqual(b.classification, 'cls_a')
        self.assertEqual(b.source, 'manual')
        self.assertEqual(b.anno_data, {'purpose': 'test'})

    def test_bounding_box(self):
        outer_rect = np.array([[10.0, 10.0], [40.0, 10.0], [40.0, 40.0], [10.0, 40.0]])
        inner_rect = np.array([[20.0, 20.0], [30.0, 20.0], [30.0, 30.0], [20.0, 30.0]])
        a = labelling_tool.PolygonLabel(regions=[inner_rect], object_id='abc_123', classification='cls_a',
                                        source='manual', anno_data={'purpose': 'test'})
        b = labelling_tool.PolygonLabel(regions=[outer_rect, inner_rect], object_id='abc_123', classification='cls_a',
                                        source='manual', anno_data={'purpose': 'test'})
        self.assertTrue((a.bounding_box()[0] == np.array([20.0, 20.0])).all())
        self.assertTrue((a.bounding_box()[1] == np.array([30.0, 30.0])).all())
        self.assertTrue((b.bounding_box()[0] == np.array([10.0, 10.0])).all())
        self.assertTrue((b.bounding_box()[1] == np.array([40.0, 40.0])).all())

    def test_warped(self):
        outer_rect = np.array([[10.0, 10.0], [40.0, 10.0], [40.0, 40.0], [10.0, 40.0]])
        inner_rect = np.array([[20.0, 20.0], [30.0, 20.0], [30.0, 30.0], [20.0, 30.0]])
        a = labelling_tool.PolygonLabel(regions=[inner_rect], object_id='abc_123', classification='cls_a',
                                        source='manual', anno_data={'purpose': 'test'})
        b = labelling_tool.PolygonLabel(regions=[outer_rect, inner_rect], object_id='abc_123', classification='cls_a',
                                        source='manual', anno_data={'purpose': 'test'})
        a_7 = a.warped(lambda p_xy: p_xy + 7.0)
        b_7 = b.warped(lambda p_xy: p_xy + 7.0)
        self.assertEqual(len(a_7.regions), 1)
        self.assertTrue((a_7.regions[0] == (inner_rect + 7)).all())
        self.assertEqual(len(b_7.regions), 2)
        self.assertTrue((b_7.regions[0] == (outer_rect + 7)).all())
        self.assertTrue((b_7.regions[1] == (inner_rect + 7)).all())

    def test_render_mask(self):
        outer_rect = np.array([[10.0, 10.0], [40.0, 10.0], [40.0, 40.0], [10.0, 40.0]])
        inner_rect = np.array([[20.0, 20.0], [30.0, 20.0], [30.0, 30.0], [20.0, 30.0]])
        a = labelling_tool.PolygonLabel(regions=[inner_rect], object_id='abc_123', classification='cls_a',
                                        source='manual', anno_data={'purpose': 'test'})
        b = labelling_tool.PolygonLabel(regions=[outer_rect, inner_rect], object_id='abc_123', classification='cls_a',
                                        source='manual', anno_data={'purpose': 'test'})
        # Outlined
        tgt_a_outline = Image.new('L', (50, 50), 0)
        ImageDraw.Draw(tgt_a_outline).polygon([tuple(v) for v in inner_rect], outline=1, fill=0)
        self.assertTrue((a.render_mask(50, 50, fill=False, dx=0.0, dy=0.0, ctx=None) ==
                         np.array(tgt_a_outline)).all())

        tgt_b_outline = Image.new('L', (50, 50), 0)
        ImageDraw.Draw(tgt_b_outline).polygon([tuple(v) for v in outer_rect], outline=1, fill=0)
        ImageDraw.Draw(tgt_b_outline).polygon([tuple(v) for v in inner_rect], outline=1, fill=0)
        self.assertTrue((b.render_mask(50, 50, fill=False, dx=0.0, dy=0.0, ctx=None) ==
                         np.array(tgt_b_outline)).all())

        # Outlined, offset
        tgt_b_outline_dxy = Image.new('L', (50, 50), 0)
        ImageDraw.Draw(tgt_b_outline_dxy).polygon([tuple(v) for v in outer_rect + np.array([5, -5])], outline=1, fill=0)
        ImageDraw.Draw(tgt_b_outline_dxy).polygon([tuple(v) for v in inner_rect + np.array([5, -5])], outline=1, fill=0)
        self.assertTrue((b.render_mask(50, 50, fill=False, dx=5.0, dy=-5.0, ctx=None) ==
                         np.array(tgt_b_outline_dxy)).all())

        # Filled
        tgt_a_filled = Image.new('L', (50, 50), 0)
        ImageDraw.Draw(tgt_a_filled).polygon([tuple(v) for v in inner_rect], outline=1, fill=1)
        self.assertTrue((a.render_mask(50, 50, fill=True, dx=0.0, dy=0.0, ctx=None) ==
                         np.array(tgt_a_filled)).all())

        tgt_b_filled = Image.new('L', (50, 50), 0)
        ImageDraw.Draw(tgt_b_filled).polygon([tuple(v) for v in outer_rect], outline=1, fill=1)
        ImageDraw.Draw(tgt_b_filled).polygon([tuple(v) for v in inner_rect], outline=0, fill=0)
        self.assertTrue((b.render_mask(50, 50, fill=True, dx=0.0, dy=0.0, ctx=None) ==
                         np.array(tgt_b_filled)).all())

        # Filled, offset
        tgt_b_filled_dxy = Image.new('L', (50, 50), 0)
        ImageDraw.Draw(tgt_b_filled_dxy).polygon([tuple(v) for v in outer_rect + np.array([5, -5])], outline=1, fill=1)
        ImageDraw.Draw(tgt_b_filled_dxy).polygon([tuple(v) for v in inner_rect + np.array([5, -5])], outline=0, fill=0)
        self.assertTrue((b.render_mask(50, 50, fill=True, dx=5.0, dy=-5.0, ctx=None) ==
                         np.array(tgt_b_filled_dxy)).all())

    def test_to_json(self):
        outer_rect = np.array([[10.0, 10.0], [40.0, 10.0], [40.0, 40.0], [10.0, 40.0]])
        inner_rect = np.array([[20.0, 20.0], [30.0, 20.0], [30.0, 30.0], [20.0, 30.0]])
        a = labelling_tool.PolygonLabel(regions=[inner_rect], object_id='abc_123', classification='cls_a',
                                        source='manual', anno_data={'purpose': 'test'})
        b = labelling_tool.PolygonLabel(regions=[outer_rect, inner_rect], object_id='abc_123', classification='cls_a',
                                        source='manual', anno_data={'purpose': 'test'})

        outer_js = [dict(x=p[0], y=p[1]) for p in outer_rect]
        inner_js = [dict(x=p[0], y=p[1]) for p in inner_rect]
        self.assertEqual(a.to_json(),
                         dict(label_type='polygon', regions=[inner_js], object_id='abc_123',
                              label_class='cls_a', source='manual', anno_data={'purpose': 'test'}))
        self.assertEqual(b.to_json(),
                         dict(label_type='polygon', regions=[outer_js, inner_js], object_id='abc_123',
                              label_class='cls_a', source='manual', anno_data={'purpose': 'test'}))

    def test_from_json(self):
        outer_rect = np.array([[10.0, 10.0], [40.0, 10.0], [40.0, 40.0], [10.0, 40.0]])
        inner_rect = np.array([[20.0, 20.0], [30.0, 20.0], [30.0, 30.0], [20.0, 30.0]])

        outer_js = [dict(x=p[0], y=p[1]) for p in outer_rect]
        inner_js = [dict(x=p[0], y=p[1]) for p in inner_rect]

        obj_tab = labelling_tool.ObjectTable('abc')
        js_a = dict(label_type='polygon', regions=[inner_js], object_id='abc_123',
                    label_class='cls_a', source='manual', anno_data={'purpose': 'test'})
        js_b = dict(label_type='polygon', regions=[outer_js, inner_js], object_id='abc_124',
                    label_class='cls_b', source='manual2', anno_data={'purpose': 'test2'})
        a = labelling_tool.AbstractLabel.from_json(js_a, obj_tab)
        b = labelling_tool.AbstractLabel.from_json(js_b, obj_tab)
        self.assertTrue(isinstance(a, labelling_tool.PolygonLabel))
        self.assertTrue(isinstance(b, labelling_tool.PolygonLabel))
        self.assertEqual(len(a.regions), 1)
        self.assertTrue((a.regions[0] == inner_rect).all())
        self.assertEqual(len(b.regions), 2)
        self.assertTrue((b.regions[0] == outer_rect).all())
        self.assertTrue((b.regions[1] == inner_rect).all())
        self.assertEqual(a.object_id, 'abc_123')
        self.assertEqual(b.object_id, 'abc_124')
        self.assertEqual(a.classification, 'cls_a')
        self.assertEqual(b.classification, 'cls_b')
        self.assertEqual(a.source, 'manual')
        self.assertEqual(b.source, 'manual2')
        self.assertEqual(a.anno_data, {'purpose': 'test'})
        self.assertEqual(b.anno_data, {'purpose': 'test2'})

    def test_mask_image_to_regions(self):
        outer_rect = np.array([[10.0, 10.0], [40.0, 10.0], [40.0, 40.0], [10.0, 40.0]])
        # skimage.measure.find_contours rounds corners
        outer_rect_v2 = np.array([[10.0, 9.5], [40.0, 9.5], [40.5, 10.0], [40.5, 40.0],
                                  [40.0, 40.5], [10.0, 40.5], [9.5, 40.0], [9.5, 10.0]])
        inner_rect = np.array([[20.0, 20.0], [30.0, 20.0], [30.0, 30.0], [20.0, 30.0]])
        inner_rect_v2 = np.array([[20.0, 19.5], [30.0, 19.5], [30.5, 20.0], [30.5, 30.0],
                                  [30.0, 30.5], [20.0, 30.5], [19.5, 30.0], [19.5, 20.0]])

        tgt_a_filled = Image.new('L', (50, 50), 0)
        ImageDraw.Draw(tgt_a_filled).polygon([tuple(v) for v in inner_rect], outline=1, fill=1)
        reg_a = labelling_tool.PolygonLabel.mask_image_to_regions(np.array(tgt_a_filled) != 0)
        self.assertEqual(len(reg_a), 1)
        self.assertTrue(self.are_polygons_cyclically_equal(reg_a[0], inner_rect_v2, both_directions=True))

        tgt_b_filled = Image.new('L', (50, 50), 0)
        ImageDraw.Draw(tgt_b_filled).polygon([tuple(v) for v in outer_rect], outline=1, fill=1)
        ImageDraw.Draw(tgt_b_filled).polygon([tuple(v) for v in inner_rect], outline=0, fill=0)
        reg_b = labelling_tool.PolygonLabel.mask_image_to_regions(np.array(tgt_b_filled) != 0)
        self.assertEqual(len(reg_b), 2)
        self.assertTrue(self.are_polygons_cyclically_equal(reg_b[0], outer_rect_v2, both_directions=True))
        self.assertTrue(self.are_polygons_cyclically_equal(reg_b[1], inner_rect_v2, both_directions=True))

    def test_mask_image_to_regions_cv(self):
        outer_rect = np.array([[10.0, 10.0], [40.0, 10.0], [40.0, 40.0], [10.0, 40.0]])
        inner_rect = np.array([[20.0, 20.0], [30.0, 20.0], [30.0, 30.0], [20.0, 30.0]])
        # cv2.findContours generates a slightly rotated square for the inner region...
        inner_rect_v2 = np.array([[20.0, 19.0], [31.0, 20.0], [30.0, 31.0], [19.0, 30.0]])

        tgt_a_filled = Image.new('L', (50, 50), 0)
        ImageDraw.Draw(tgt_a_filled).polygon([tuple(v) for v in inner_rect], outline=1, fill=1)
        reg_a = labelling_tool.PolygonLabel.mask_image_to_regions_cv(np.array(tgt_a_filled) != 0)
        self.assertEqual(len(reg_a), 1)
        self.assertTrue(self.are_polygons_cyclically_equal(reg_a[0], inner_rect.astype(int), both_directions=True))

        tgt_b_filled = Image.new('L', (50, 50), 0)
        ImageDraw.Draw(tgt_b_filled).polygon([tuple(v) for v in outer_rect], outline=1, fill=1)
        ImageDraw.Draw(tgt_b_filled).polygon([tuple(v) for v in inner_rect], outline=0, fill=0)
        reg_b = labelling_tool.PolygonLabel.mask_image_to_regions_cv(np.array(tgt_b_filled) != 0)
        self.assertEqual(len(reg_b), 2)
        self.assertTrue(self.are_polygons_cyclically_equal(reg_b[0], outer_rect.astype(int), both_directions=True))
        self.assertTrue(self.are_polygons_cyclically_equal(reg_b[1], inner_rect_v2.astype(int), both_directions=True))


class BoxLabelTestCase(TestCase):
    def test_constructor(self):
        a = labelling_tool.BoxLabel(centre_xy=np.array([15.0, 25.0]), size_xy=np.array([8.0, 12.0]),
                                    object_id='abc_123', classification='cls_a',
                                    source='manual', anno_data={'purpose': 'test'})
        self.assertTrue((a.centre_xy == np.array([15.0, 25.0])).all())
        self.assertTrue((a.size_xy == np.array([8.0, 12.0])).all())
        self.assertEqual(a.object_id, 'abc_123')
        self.assertEqual(a.classification, 'cls_a')
        self.assertEqual(a.source, 'manual')
        self.assertEqual(a.anno_data, {'purpose': 'test'})

    def test_bounding_box(self):
        a = labelling_tool.BoxLabel(centre_xy=np.array([15.0, 25.0]), size_xy=np.array([8.0, 12.0]))
        self.assertTrue((a.bounding_box()[0] == np.array([11.0, 19.0])).all())
        self.assertTrue((a.bounding_box()[1] == np.array([19.0, 31.0])).all())

    def test_warped(self):
        a = labelling_tool.BoxLabel(centre_xy=np.array([15.0, 25.0]), size_xy=np.array([8.0, 12.0]))

        a_7 = a.warped(lambda p_xy: p_xy + 7.0)
        self.assertTrue((a_7.centre_xy == np.array([22.0, 32.0])).all())
        self.assertTrue((a_7.size_xy == np.array([8.0, 12.0])).all())

        # Rotation matrix
        theta = np.radians(20.0)
        c = np.cos(theta)
        s = np.sin(theta)
        r = np.array([[c, -s],
                      [s, c]])
        a_r = a.warped(lambda p_xy: (r @ p_xy.T).T)
        self.assertTrue(np.allclose(a_r.centre_xy, r @ np.array([15.0, 25.0])))
        self.assertTrue(np.allclose(a_r.size_xy, np.array([8.0 * c + 12.0 * s, 12.0 * c + 8.0 * s])))

    def test_render_mask(self):
        a = labelling_tool.BoxLabel(centre_xy=np.array([15.0, 25.0]), size_xy=np.array([8.0, 12.0]))

        # Outlined
        tgt_a_outline = Image.new('L', (50, 50), 0)
        ImageDraw.Draw(tgt_a_outline).rectangle([(11.0, 19.0), (19.0, 31.0)], outline=1, fill=0)
        self.assertTrue((a.render_mask(50, 50, fill=False, dx=0.0, dy=0.0, ctx=None) ==
                         np.array(tgt_a_outline)).all())

        # Outlined, offset
        tgt_b_outline_dxy = Image.new('L', (50, 50), 0)
        ImageDraw.Draw(tgt_b_outline_dxy).rectangle([(16.0, 14.0), (24.0, 26.0)], outline=1, fill=0)
        self.assertTrue((a.render_mask(50, 50, fill=False, dx=5.0, dy=-5.0, ctx=None) ==
                         np.array(tgt_b_outline_dxy)).all())

        # Filled
        tgt_a_filled = Image.new('L', (50, 50), 0)
        ImageDraw.Draw(tgt_a_filled).rectangle([(11.0, 19.0), (19.0, 31.0)], outline=1, fill=1)
        self.assertTrue((a.render_mask(50, 50, fill=True, dx=0.0, dy=0.0, ctx=None) ==
                         np.array(tgt_a_filled)).all())

        # Filled, offset
        tgt_b_filled_dxy = Image.new('L', (50, 50), 0)
        ImageDraw.Draw(tgt_b_filled_dxy).rectangle([(16.0, 14.0), (24.0, 26.0)], outline=1, fill=1)
        self.assertTrue((a.render_mask(50, 50, fill=True, dx=5.0, dy=-5.0, ctx=None) ==
                         np.array(tgt_b_filled_dxy)).all())

    def test_to_json(self):
        a = labelling_tool.BoxLabel(centre_xy=np.array([15.0, 25.0]), size_xy=np.array([8.0, 12.0]),
                                    object_id='abc_123', classification='cls_a',
                                    source='manual', anno_data={'purpose': 'test'})

        self.assertEqual(a.to_json(),
                         dict(label_type='box', centre=dict(x=15.0, y=25.0), size=dict(x=8.0, y=12.0),
                              object_id='abc_123', label_class='cls_a', source='manual',
                              anno_data={'purpose': 'test'}))

    def test_from_json(self):
        obj_tab = labelling_tool.ObjectTable('abc')
        js_a = dict(label_type='box', centre=dict(x=15.0, y=25.0), size=dict(x=8.0, y=12.0),
                    object_id='abc_123', label_class='cls_a', source='manual', anno_data={'purpose': 'test'})
        a = labelling_tool.AbstractLabel.from_json(js_a, obj_tab)
        self.assertTrue(isinstance(a, labelling_tool.BoxLabel))
        self.assertTrue((a.centre_xy == np.array([15.0, 25.0])).all())
        self.assertTrue((a.size_xy == np.array([8.0, 12.0])).all())
        self.assertEqual(a.object_id, 'abc_123')
        self.assertEqual(a.classification, 'cls_a')
        self.assertEqual(a.source, 'manual')
        self.assertEqual(a.anno_data, {'purpose': 'test'})


class OrientedEllipseLabelTestCase(TestCase):
    def test_constructor(self):
        a = labelling_tool.OrientedEllipseLabel(
            centre_xy=np.array([15.0, 25.0]), radius1=10.0, radius2=3.0, orientation_rad=math.radians(30.0),
            object_id='abc_123', classification='cls_a', source='manual', anno_data={'purpose': 'test'})
        self.assertTrue((a.centre_xy == np.array([15.0, 25.0])).all())
        self.assertEqual(a.radius1, 10.0)
        self.assertEqual(a.radius2, 3.0)
        self.assertEqual(a.orientation_rad, math.radians(30.0))
        self.assertEqual(a.object_id, 'abc_123')
        self.assertEqual(a.classification, 'cls_a')
        self.assertEqual(a.source, 'manual')
        self.assertEqual(a.anno_data, {'purpose': 'test'})

    def test_bounding_box(self):
        # Ellipse with no orientation
        a = labelling_tool.OrientedEllipseLabel(
            centre_xy=np.array([15.0, 25.0]), radius1=4.0, radius2=6.0, orientation_rad=0.0)
        self.assertTrue(np.allclose(a.bounding_box()[0], np.array([11.0, 19.0])))
        self.assertTrue(np.allclose(a.bounding_box()[1], np.array([19.0, 31.0])))
        # 90 degrees orientation
        b = labelling_tool.OrientedEllipseLabel(
            centre_xy=np.array([15.0, 25.0]), radius1=4.0, radius2=6.0, orientation_rad=math.radians(90.0))
        self.assertTrue(np.allclose(b.bounding_box()[0], np.array([9.0, 21.0])))
        self.assertTrue(np.allclose(b.bounding_box()[1], np.array([21.0, 29.0])))
        # 45 degrees orientation
        c = labelling_tool.OrientedEllipseLabel(
            centre_xy=np.array([15.0, 25.0]), radius1=4.0, radius2=6.0, orientation_rad=math.radians(45.0))
        self.assertTrue(np.allclose(c.bounding_box()[0], np.array([9.900980486407214, 19.900980486407214])))
        self.assertTrue(np.allclose(c.bounding_box()[1], np.array([20.099019513592786, 30.099019513592786])))
        # 30 degrees orientation
        d = labelling_tool.OrientedEllipseLabel(
            centre_xy=np.array([15.0, 25.0]), radius1=4.0, radius2=6.0, orientation_rad=math.radians(30.0))
        self.assertTrue(np.allclose(d.bounding_box()[0], np.array([10.41742430504416, 19.432235637169978])))
        self.assertTrue(np.allclose(d.bounding_box()[1], np.array([19.58257569495584, 30.567764362830022])))

    def test_warped(self):
        a = labelling_tool.OrientedEllipseLabel(
            centre_xy=np.array([15.0, 25.0]), radius1=4.0, radius2=6.0, orientation_rad=0.0)

        a_7 = a.warped(lambda p_xy: p_xy + 7.0)
        self.assertTrue(np.allclose(a_7.centre_xy, np.array([22.0, 32.0])))
        self.assertTrue(np.allclose(a_7.radius1, 4.0 ))
        self.assertTrue(np.allclose(a_7.radius2, 6.0 ))
        self.assertTrue(np.allclose(a_7.orientation_rad, 0.0))

        # Rotation matrix
        theta = np.radians(20.0)
        c = np.cos(theta)
        s = np.sin(theta)
        r = np.array([[c, -s],
                      [s, c]])
        a_r = a.warped(lambda p_xy: (r @ p_xy.T).T)
        self.assertTrue(np.allclose(a_r.centre_xy, r @ np.array([15.0, 25.0])))
        self.assertTrue(np.allclose(a_r.radius1, 4.0))
        self.assertTrue(np.allclose(a_r.radius2, 6.0))
        self.assertTrue(np.allclose(a_r.orientation_rad, math.radians(20.0)))

    def test_render_mask(self):
        def draw_polygon_image(verts_xy, outline, fill, image_size):
            img = Image.new('L', image_size, 0)
            xy = [(v[0], v[1]) for v in verts_xy]
            ImageDraw.Draw(img).polygon(xy, outline=outline, fill=fill)
            return img

        a = labelling_tool.OrientedEllipseLabel(
            centre_xy=np.array([15.0, 25.0]), radius1=4.0, radius2=6.0, orientation_rad=0.0)

        # 38 vertices for
        n_verts = 38
        thetas = np.linspace(0.0, math.pi * 2, n_verts + 1)[:-1]
        # Axis aligned verts, centred on origin
        aa_verts_xy = np.stack([np.cos(thetas) * 4.0, np.sin(thetas) * 6.0], axis=1)

        # Outlined
        tgt_a_outline = draw_polygon_image(aa_verts_xy + np.array([15.0, 25.0]),
                                           outline=1, fill=0, image_size=(50,50))
        self.assertTrue((a.render_mask(50, 50, fill=False, dx=0.0, dy=0.0, ctx=None) ==
                         np.array(tgt_a_outline)).all())

        # Outlined, offset
        tgt_a_outline_dxy = draw_polygon_image(aa_verts_xy + np.array([20.0, 20.0]),
                                               outline=1, fill=0, image_size=(50,50))
        self.assertTrue((a.render_mask(50, 50, fill=False, dx=5.0, dy=-5.0, ctx=None) ==
                         np.array(tgt_a_outline_dxy)).all())

        # Filled
        tgt_a_filled = draw_polygon_image(aa_verts_xy + np.array([15.0, 25.0]),
                                          outline=1, fill=1, image_size=(50,50))
        self.assertTrue((a.render_mask(50, 50, fill=True, dx=0.0, dy=0.0, ctx=None) ==
                         np.array(tgt_a_filled)).all())

        # Filled, offset
        tgt_b_filled_dxy = draw_polygon_image(aa_verts_xy + np.array([20.0, 20.0]),
                                              outline=1, fill=1, image_size=(50,50))
        self.assertTrue((a.render_mask(50, 50, fill=True, dx=5.0, dy=-5.0, ctx=None) ==
                         np.array(tgt_b_filled_dxy)).all())

        # With orientation
        b = labelling_tool.OrientedEllipseLabel(
            centre_xy=np.array([15.0, 25.0]), radius1=4.0, radius2=6.0, orientation_rad=math.radians(25.0))

        rot_theta = np.radians(25.0)
        c = np.cos(rot_theta)
        s = np.sin(rot_theta)
        r = np.array([[c, -s],
                      [s, c]])

        # Outlined
        tgt_b_outline = draw_polygon_image((r @ aa_verts_xy.T).T + np.array([15.0, 25.0]),
                                           outline=1, fill=0, image_size=(50,50))
        self.assertTrue((b.render_mask(50, 50, fill=False, dx=0.0, dy=0.0, ctx=None) ==
                         np.array(tgt_b_outline)).all())

        # Outlined, offset
        tgt_b_outline_dxy = draw_polygon_image((r @ aa_verts_xy.T).T + np.array([20.0, 20.0]),
                                               outline=1, fill=0, image_size=(50,50))
        self.assertTrue((b.render_mask(50, 50, fill=False, dx=5.0, dy=-5.0, ctx=None) ==
                         np.array(tgt_b_outline_dxy)).all())

        # Filled
        tgt_b_filled = draw_polygon_image((r @ aa_verts_xy.T).T + np.array([15.0, 25.0]),
                                          outline=1, fill=1, image_size=(50,50))
        self.assertTrue((b.render_mask(50, 50, fill=True, dx=0.0, dy=0.0, ctx=None) ==
                         np.array(tgt_b_filled)).all())

        # Filled, offset
        tgt_b_filled_dxy = draw_polygon_image((r @ aa_verts_xy.T).T + np.array([20.0, 20.0]),
                                              outline=1, fill=1, image_size=(50,50))
        self.assertTrue((b.render_mask(50, 50, fill=True, dx=5.0, dy=-5.0, ctx=None) ==
                         np.array(tgt_b_filled_dxy)).all())

    def test_uv_points_to_params(self):
        a_cen_xy, a_rad1, a_rad2, a_ori = labelling_tool.OrientedEllipseLabel.uv_points_to_params(
            np.array([[5.0, 5.0], [15.0, 15.0]]), np.array([12.0, 8.0]))
        self.assertTrue(np.allclose(a_cen_xy, np.array([10.0, 10.0])))
        self.assertTrue(np.allclose(a_rad1, 5.0 * math.sqrt(2.0)))
        self.assertTrue(np.allclose(a_rad2, 2.0 * math.sqrt(2.0)))
        self.assertTrue(np.allclose(a_ori, np.radians(45.0)))

    def test_to_json(self):
        a = labelling_tool.OrientedEllipseLabel(
            centre_xy=np.array([15.0, 25.0]), radius1=10.0, radius2=3.0, orientation_rad=math.radians(30.0),
            object_id='abc_123', classification='cls_a', source='manual', anno_data={'purpose': 'test'})

        self.assertEqual(a.to_json(),
                         dict(label_type='oriented_ellipse', centre=dict(x=15.0, y=25.0), radius1=10.0,
                              radius2=3.0, orientation_radians=math.radians(30.0),
                              object_id='abc_123', label_class='cls_a', source='manual',
                              anno_data={'purpose': 'test'}))

    def test_from_uv_points(self):
        a = labelling_tool.OrientedEllipseLabel.new_instance_from_uv_points(
            np.array([[5.0, 5.0], [15.0, 15.0]]), np.array([12.0, 8.0]),
            object_id='abc_123', classification='cls_a', source='manual', anno_data={'purpose': 'test'})
        self.assertTrue(np.allclose(a.centre_xy, np.array([10.0, 10.0])))
        self.assertTrue(np.allclose(a.radius1, 5.0 * math.sqrt(2.0)))
        self.assertTrue(np.allclose(a.radius2, 2.0 * math.sqrt(2.0)))
        self.assertTrue(np.allclose(a.orientation_rad, np.radians(45.0)))
        self.assertEqual(a.object_id, 'abc_123')
        self.assertEqual(a.classification, 'cls_a')
        self.assertEqual(a.source, 'manual')
        self.assertEqual(a.anno_data, {'purpose': 'test'})

    def test_from_json(self):
        obj_tab = labelling_tool.ObjectTable('abc')
        js_a = dict(label_type='oriented_ellipse', centre=dict(x=15.0, y=25.0), radius1=10.0,
                    radius2=3.0, orientation_radians=math.radians(30.0),
                    object_id='abc_123', label_class='cls_a', source='manual', anno_data={'purpose': 'test'})
        a = labelling_tool.AbstractLabel.from_json(js_a, obj_tab)
        self.assertTrue(isinstance(a, labelling_tool.OrientedEllipseLabel))
        self.assertTrue((a.centre_xy == np.array([15.0, 25.0])).all())
        self.assertEqual(a.radius1, 10.0)
        self.assertEqual(a.radius2, 3.0)
        self.assertEqual(a.orientation_rad, math.radians(30.0))
        self.assertEqual(a.object_id, 'abc_123')
        self.assertEqual(a.classification, 'cls_a')
        self.assertEqual(a.source, 'manual')
        self.assertEqual(a.anno_data, {'purpose': 'test'})
