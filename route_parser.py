import json
import sys

GRID_ROWS = 267
GRID_COLS = 267
CELL_SIZE_M = 20


def parse_route(data):
    """
    Accept a coordinate, a route, or an object containing a route.
    """
    if isinstance(data, dict):
        data = data.get("route")

    if not isinstance(data, list) or not data:
        raise ValueError("Expected a coordinate or a non-empty route list.")

    if len(data) == 2 and all(type(value) is int for value in data):
        return [data]

    return data


def is_valid_coordinate(point):
    return (
        isinstance(point, list)
        and len(point) == 2
        and all(type(value) is int for value in point)
        and 0 <= point[0] < GRID_ROWS
        and 0 <= point[1] < GRID_COLS
    )


def load_blocked_cells(filename):
    """
    Read blocked coordinates from a JSON list, such as:
    [[10, 21], [15, 30]]
    """
    with open(filename, "r", encoding="utf-8") as file:
        data = json.load(file)

    if not isinstance(data, list):
        raise ValueError("Blocked-cell file must contain a JSON list.")

    blocked_cells = set()

    for index, point in enumerate(data):
        if not is_valid_coordinate(point):
            raise ValueError(
                f"Blocked cell {index} must be an in-bounds [row, col]."
            )
        blocked_cells.add(tuple(point))

    return blocked_cells


def calculate_route_distance(route):
    """Calculate horizontal grid distance for a validated route."""
    total_distance = 0.0

    for index in range(1, len(route)):
        previous_row, previous_col = route[index - 1]
        row, col = route[index]

        row_step = abs(row - previous_row)
        col_step = abs(col - previous_col)

        if row_step == 1 and col_step == 1:
            total_distance += CELL_SIZE_M * (2 ** 0.5)
        else:
            total_distance += CELL_SIZE_M

    return round(total_distance, 2)


def validate_route(route, blocked_cells):
    """Validate format, bounds, continuity, and the supplied blocked-cell mask."""

    # First validate every coordinate and step.
    for index, point in enumerate(route):
        if (
            not isinstance(point, list)
            or len(point) != 2
            or any(type(value) is not int for value in point)
        ):
            return {
                "status": "error",
                "check": "format",
                "message": f"Point {index} must be [row, col] with integers.",
            }

        row, col = point

        if not (0 <= row < GRID_ROWS and 0 <= col < GRID_COLS):
            return {
                "status": "error",
                "check": "bounds",
                "message": f"Point {index} is outside the grid.",
                "point": point,
            }

        if index > 0:
            previous_row, previous_col = route[index - 1]
            row_step = abs(row - previous_row)
            col_step = abs(col - previous_col)

            if max(row_step, col_step) != 1:
                return {
                    "status": "error",
                    "check": "continuity",
                    "message": f"Point {index} must be adjacent to the previous point.",
                    "previous_point": route[index - 1],
                    "point": point,
                }

    # Reject routes that enter blocked cells, including the start or end.
    for index, point in enumerate(route):
        if tuple(point) in blocked_cells:
            return {
                "status": "error",
                "check": "blocked_cell",
                "message": f"Point {index} is in a blocked cell.",
                "point": point,
            }

    # For a diagonal move, both neighboring orthogonal cells must be open.
    for index in range(1, len(route)):
        previous_row, previous_col = route[index - 1]
        row, col = route[index]

        if row != previous_row and col != previous_col:
            side_cells = [
                [previous_row, col],
                [row, previous_col],
            ]

            blocked_sides = [
                cell for cell in side_cells if tuple(cell) in blocked_cells
            ]

            if blocked_sides:
                return {
                    "status": "error",
                    "check": "corner_cut",
                    "message": "Diagonal move passes a blocked corner.",
                    "previous_point": route[index - 1],
                    "point": route[index],
                    "blocked_side_cells": blocked_sides,
                }
    distance = calculate_route_distance(route)

    return {
        "status": "partial",
        "message": (
            "Route checks passed against the supplied blocked-cell file; "
            "M3 route cost has not been calculated."
        ),
        "point_count": len(route),
        "distance_m": distance,
        "metrics": {
            "distance_m": distance,
            "cost": None,
            "cost_status": "not_calculated",
        },
        "checks": {
            "format": "passed",
            "bounds": "passed",
            "continuity": "passed",
            "blocked_cells": "passed",
            "corner_cuts": "passed",
        },
        "route": route,
    }


def main():
    try:
        if len(sys.argv) != 2:
            raise ValueError(
                "Usage: python3 route_parser.py blocked_cells.json"
            )

        blocked_cells = load_blocked_cells(sys.argv[1])
        input_data = json.load(sys.stdin)
        route = parse_route(input_data)
        result = validate_route(route, blocked_cells)

    except json.JSONDecodeError as error:
        result = {
            "status": "error",
            "check": "json",
            "message": f"Invalid JSON: {error.msg}",
        }

    except (ValueError, OSError) as error:
        result = {
            "status": "error",
            "check": "input",
            "message": str(error),
        }

    print(json.dumps(result))
    return 1 if result["status"] == "error" else 0


if __name__ == "__main__":
    sys.exit(main())
