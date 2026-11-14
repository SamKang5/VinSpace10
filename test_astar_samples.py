import math
import unittest

from route_algorithm import CELL_SIZE_M, find_route


def route_distance(route):
    """Calculate distance without rounding."""
    return sum(
        CELL_SIZE_M * math.hypot(
            current[0] - previous[0],
            current[1] - previous[1],
        )
        for previous, current in zip(route, route[1:])
    )


def assert_valid_route(test, route, start, goal, blocked, rows, cols):
    """Check endpoints, bounds, adjacency, and corner-cut rules."""
    test.assertIsNotNone(route)
    test.assertEqual(route[0], list(start))
    test.assertEqual(route[-1], list(goal))

    for row, col in route:
        test.assertTrue(0 <= row < rows and 0 <= col < cols)
        test.assertNotIn((row, col), blocked)

    for previous, current in zip(route, route[1:]):
        dr = current[0] - previous[0]
        dc = current[1] - previous[1]

        test.assertEqual(max(abs(dr), abs(dc)), 1)

        if dr != 0 and dc != 0:
            test.assertNotIn((previous[0] + dr, previous[1]), blocked)
            test.assertNotIn((previous[0], previous[1] + dc), blocked)


class TestAStarSamples(unittest.TestCase):

    def test_straight_path(self):
        start, goal = (0, 0), (0, 2)
        blocked = set()

        route = find_route(start, goal, blocked, rows=3, cols=3)

        assert_valid_route(self, route, start, goal, blocked, 3, 3)
        self.assertAlmostEqual(route_distance(route), 40.0)

    def test_mixed_diagonal_and_straight_path(self):
        start, goal = (0, 0), (2, 3)
        blocked = set()

        route = find_route(start, goal, blocked, rows=4, cols=4)

        assert_valid_route(self, route, start, goal, blocked, 4, 4)
        expected = CELL_SIZE_M * (2 * math.sqrt(2) + 1)
        self.assertAlmostEqual(route_distance(route), expected)

    def test_shortest_detour_around_blocked_cell(self):
        start, goal = (0, 0), (0, 2)
        blocked = {(0, 1)}

        route = find_route(start, goal, blocked, rows=3, cols=3)

        assert_valid_route(self, route, start, goal, blocked, 3, 3)
        # Corner-cut rules require four straight steps.
        self.assertAlmostEqual(route_distance(route), 80.0)

    def test_same_start_and_goal(self):
        route = find_route((1, 1), (1, 1), set(), rows=3, cols=3)

        self.assertEqual(route, [[1, 1]])
        self.assertEqual(route_distance(route), 0.0)

    def test_unreachable_goal(self):
        blocked = {(0, 1), (1, 1), (2, 1)}

        route = find_route((1, 0), (1, 2), blocked, rows=3, cols=3)

        self.assertIsNone(route)


if __name__ == "__main__":
    unittest.main()
