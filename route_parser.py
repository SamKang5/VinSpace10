import json
import sys

GRID_ROWS = 267
GRID_COLS = 267


def parse_route(data):
    """
    Normalize the input into a list of [row, col] points.

    Accepted formats:
      [10, 20]
      [[10, 20], [11, 21]]
      {"route": [[10, 20], [11, 21]]}
    """
    if isinstance(data, dict):
        data = data.get("route")

    if not isinstance(data, list) or not data:
        raise ValueError("Expected a coordinate or a non-empty route list.")

    # Convert a single coordinate into a route with one point.
    if len(data) == 2 and all(type(value) is int for value in data):
        return [data]

    return data


def validate_route(route):
    """Check coordinate format, grid bounds, and route continuity."""
    for index, point in enumerate(route):
        # 1. Check coordinate format.
        if (
            not isinstance(point, list)
            or len(point) != 2
            or any(type(value) is not int for value in point)
        ):
            return {
                "status": "error",
                "check": "format",
                "message": f"Point {index} must be [row, col] with integer values.",
            }

        row, col = point

        # 2. Check grid bounds.
        if not (0 <= row < GRID_ROWS and 0 <= col < GRID_COLS):
            return {
                "status": "error",
                "check": "bounds",
                "message": f"Point {index} is outside the grid.",
                "point": point,
            }

        # 3. Check that consecutive points are neighboring cells.
        # This prototype allows horizontal, vertical, and diagonal moves.
        if index > 0:
            previous_row, previous_col = route[index - 1]
            row_step = abs(row - previous_row)
            col_step = abs(col - previous_col)

            if max(row_step, col_step) != 1:
                return {
                    "status": "error",
                    "check": "continuity",
                    "message": (
                        f"Point {index} must be adjacent to the previous point."
                    ),
                    "previous_point": route[index - 1],
                    "point": point,
                }

    # TODO: Load the navigation cost grid and check whether every
    # route cell has a finite, traversable cost.
    return {
        "status": "partial",
        "message": "Basic checks passed; terrain validation is not implemented.",
        "point_count": len(route),
        "checks": {
            "format": "passed",
            "bounds": "passed",
            "continuity": "passed",
            "traversability": "not_checked",
        },
        "route": route,
    }


def main():
    try:
        input_data = json.load(sys.stdin)
        route = parse_route(input_data)
        result = validate_route(route)

    except json.JSONDecodeError:
        result = {
            "status": "error",
            "check": "json",
            "message": "Input must be valid JSON.",
        }

    except ValueError as error:
        result = {
            "status": "error",
            "check": "input",
            "message": str(error),
        }

    print(json.dumps(result))
    return 1 if result["status"] == "error" else 0


if __name__ == "__main__":
    sys.exit(main())
