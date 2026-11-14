import json
import math
from pathlib import Path

from route_algorithm import find_route


PROJECT_DIR = Path(__file__).resolve().parent
GRID_FILE = PROJECT_DIR / "test_grid.json"
OUTPUT_FILE = PROJECT_DIR / "test_grid_route.json"

CELL_SIZE_M = 20


def route_distance_m(route):
    """Calculate distance using orthogonal and diagonal grid steps."""
    distance = 0.0

    for current, next_point in zip(route, route[1:]):
        row_change = abs(next_point[0] - current[0])
        col_change = abs(next_point[1] - current[1])

        if row_change == 1 and col_change == 1:
            distance += CELL_SIZE_M * math.sqrt(2)
        elif row_change + col_change == 1:
            distance += CELL_SIZE_M
        else:
            raise ValueError("Route contains a non-adjacent step.")

    return round(distance, 2)


def print_grid(rows, cols, start, goal, blocked, route):
    """Display the grid in the terminal."""
    route_cells = {tuple(point) for point in route} if route else set()

    print("\nGrid: S = start, G = goal, # = blocked, * = route")
    print("     " + " ".join(str(col) for col in range(cols)))

    for row in range(rows):
        symbols = []

        for col in range(cols):
            point = (row, col)

            if point == start and point == goal:
                symbol = "S"
            elif point == start:
                symbol = "S"
            elif point == goal:
                symbol = "G"
            elif point in blocked:
                symbol = "#"
            elif point in route_cells:
                symbol = "*"
            else:
                symbol = "."

            symbols.append(symbol)

        print(f"{row:>3}  " + " ".join(symbols))


def main():
    with GRID_FILE.open("r", encoding="utf-8") as file:
        grid = json.load(file)

    rows = grid["rows"]
    cols = grid["cols"]
    start = tuple(grid["start"])
    goal = tuple(grid["goal"])
    blocked = {tuple(point) for point in grid["blocked_cells"]}

    route = find_route(start, goal, blocked, rows=rows, cols=cols)

    if route is None:
        result = {
            "grid": grid["name"],
            "mode": "shortest_distance",
            "status": "no_route",
            "route": None,
            "metrics": {
                "distance_m": None,
                "cost": None,
                "cost_status": "not_calculated"
            }
        }
    else:
        result = {
            "grid": grid["name"],
            "mode": "shortest_distance",
            "status": "route_found",
            "route": route,
            "metrics": {
                "distance_m": route_distance_m(route),
                "cost": None,
                "cost_status": "not_calculated"
            }
        }

    with OUTPUT_FILE.open("w", encoding="utf-8") as file:
        json.dump(result, file, indent=2)

    print_grid(rows, cols, start, goal, blocked, route)
    print("\nResult:")
    print(json.dumps(result, indent=2))
    print(f"\nSaved: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
