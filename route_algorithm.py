import heapq
import math

CELL_SIZE_M = 20


def find_route(start, goal, blocked_cells, rows=267, cols=267):
    """
    Find a shortest-distance route using A*.

    Returns a list of [row, col] points, or None if no route exists.
    Diagonal moves cannot pass beside a blocked corner.
    """

    if rows <= 0 or cols <= 0:
        raise ValueError("Grid dimensions must be positive.")

    def in_bounds(point):
        row, col = point
        return 0 <= row < rows and 0 <= col < cols

    if not in_bounds(start) or not in_bounds(goal):
        raise ValueError("Start and goal must be inside the grid.")

    if start in blocked_cells or goal in blocked_cells:
        return None

    if start == goal:
        return [[start[0], start[1]]]

    def heuristic(point):
        row_diff = abs(point[0] - goal[0])
        col_diff = abs(point[1] - goal[1])
        diagonal_steps = min(row_diff, col_diff)
        straight_steps = max(row_diff, col_diff) - diagonal_steps

        return CELL_SIZE_M * (
            diagonal_steps * math.sqrt(2) + straight_steps
        )

    frontier = [(heuristic(start), 0.0, start)]
    best_distance = {start: 0.0}
    came_from = {}

    while frontier:
        _, current_distance, current = heapq.heappop(frontier)

        if current_distance > best_distance[current]:
            continue

        if current == goal:
            route = [current]

            while current in came_from:
                current = came_from[current]
                route.append(current)

            route.reverse()
            return [[row, col] for row, col in route]

        current_row, current_col = current

        for row_step in (-1, 0, 1):
            for col_step in (-1, 0, 1):
                if row_step == 0 and col_step == 0:
                    continue

                neighbor = (
                    current_row + row_step,
                    current_col + col_step,
                )

                if not in_bounds(neighbor) or neighbor in blocked_cells:
                    continue

                diagonal = row_step != 0 and col_step != 0

                if diagonal:
                    side_a = (current_row + row_step, current_col)
                    side_b = (current_row, current_col + col_step)

                    if side_a in blocked_cells or side_b in blocked_cells:
                        continue

                step_distance = CELL_SIZE_M * (
                    math.sqrt(2) if diagonal else 1
                )
                new_distance = current_distance + step_distance

                if new_distance < best_distance.get(neighbor, math.inf):
                    best_distance[neighbor] = new_distance
                    came_from[neighbor] = current

                    heapq.heappush(
                        frontier,
                        (
                            new_distance + heuristic(neighbor),
                            new_distance,
                            neighbor,
                        ),
                    )

    return None