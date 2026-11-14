import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from build_m2_04_imagery import grid_to_image, image_to_grid, image_affine

class ImageryCoordinatesTests(unittest.TestCase):
    def test_centres_and_endpoints(self):
        for row, col in [(0,0), (266,266), (133,133), (230,30), (35,235)]:
            x, y = grid_to_image(row, col)
            self.assertEqual((x,y), (4*col+2, 4*row+2))
            self.assertEqual(image_to_grid(x,y), (row,col))

    def test_exact_boundaries(self):
        self.assertEqual(image_to_grid(0,0), (0,0))
        self.assertEqual(image_to_grid(4,4), (1,1))
        for p in [(-0.01,0), (1068,0), (0,-0.01), (0,1068)]:
            with self.assertRaises(ValueError): image_to_grid(*p)

    def test_affine(self):
        self.assertEqual(image_affine([20,0,4582523.250853,0,-20,1095993.140188], 4), [5,0,4582523.250853,0,-5,1095993.140188])

if __name__ == '__main__': unittest.main()
