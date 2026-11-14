import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from compare_routes import compare_routes
from route_algorithm import find_route
from route_parser import (
    calculate_route_distance,
    validate_route,
)


PROJECT_DIR = Path(__file__).resolve().parent


class TestRouteQA(unittest.TestCase):

    def test_01_single_coordinate_returns_json_status(self):
        # Test the actual stdin-to-JSON command-line interface.
        with tempfile.TemporaryDirectory() as temp_dir:
            blocked_file = Path(temp_dir) / "blocked.json"
            blocked_file.write_text("[]", encoding="utf-8")

            result = subprocess.run(
                [
                    sys.executable,
                    str(PROJECT_DIR / "route_parser.py"),
                    str(blocked_file),
                ],
                input="[10, 20]",
                text=True,
                capture_output=True,
                check=False,
            )

        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        self.assertEqual(output["status"], "partial")
        self.assertEqual(output["route"], [[10, 20]])

    def test_02_continuity_and_bounds(self):
        jump = validate_route([[10, 20], [15, 25]], set())
        self.assertEqual(jump["check"], "continuity")

        outside = validate_route([[266, 266], [267, 266]], set())
        self.assertEqual(outside["check"], "bounds")

    def test_03_distance_and_same_point(self):
        route = [[10, 20], [10, 21], [11, 22]]

        # One orthogonal step plus one diagonal step.
        self.assertEqual(calculate_route_distance(route), 48.28)

        same_point = find_route(
            (1, 1), (1, 1), set(), rows=3, cols=3
        )
        self.assertEqual(same_point, [[1, 1]])
        self.assertEqual(calculate_route_distance(same_point), 0.0)

    def test_04_blocked_cell_and_unreachable_goal(self):
        blocked_route = validate_route(
            [[10, 20], [10, 21]],
            {(10, 21)},
        )
        self.assertEqual(blocked_route["check"], "blocked_cell")

        # A wall separates the start and goal.
        wall = {(0, 1), (1, 1), (2, 1)}
        route = find_route((1, 0), (1, 2), wall, rows=3, cols=3)
        self.assertIsNone(route)

    def test_05_diagonal_corner_cut(self):
        result = validate_route(
            [[10, 20], [11, 21]],
            {(10, 21)},
        )
        self.assertEqual(result["check"], "corner_cut")

        # A* must take the open side rather than cut the corner.
        route = find_route(
            (0, 0), (1, 1), {(0, 1)}, rows=2, cols=2
        )
        self.assertEqual(route, [[0, 0], [1, 0], [1, 1]])

    def test_06_metrics_json(self):
        result = validate_route(
            [[10, 20], [11, 20], [12, 21]],
            set(),
        )

        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["metrics"]["distance_m"], 48.28)
        self.assertIsNone(result["metrics"]["cost"])
        self.assertEqual(
            result["metrics"]["cost_status"], "not_calculated"
        )

    def test_07_compare_route_modes(self):
        # Illustrative metrics, not M3 results.
        result = compare_routes({
            "distance_route": {
                "metrics": {"distance_m": 100, "cost": 150}
            },
            "terrain_route": {
                "metrics": {"distance_m": 120, "cost": 90}
            },
        })

        self.assertEqual(result["status"], "ok")
        self.assertEqual(
            result["differences"]["distance_m"]["absolute"], 20
        )
        self.assertEqual(
            result["differences"]["distance_m"]["percent"], 20.0
        )
        self.assertEqual(result["differences"]["cost"]["absolute"], -60)
        self.assertEqual(result["differences"]["cost"]["percent"], -40.0)

        # Missing cost must not be reported as a numerical difference.
        missing_cost = compare_routes({
            "distance_route": {
                "metrics": {"distance_m": 100, "cost": None}
            },
            "terrain_route": {
                "metrics": {"distance_m": 120, "cost": 90}
            },
        })
        self.assertIsNone(missing_cost["differences"]["cost"]["absolute"])
        self.assertEqual(missing_cost["cost_status"], "not_available")


if __name__ == "__main__":
    unittest.main()
