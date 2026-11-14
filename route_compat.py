"""Compatibility layer: port of the old TypeScript router contract to Python.

This module mirrors ``src/lib/router.ts`` from the VinSpaceTestingClone (old)
project so that the new (E) Python code can produce the same route shape and
use the same Mars 2000 great-circle metric, without changing the original
code. The original ``route_algorithm.find_route`` is left untouched.
"""

import heapq
import math
import time

MARS_RADIUS_M = 3396190
CELL_M = 20
GRID_WIDTH = 267
GRID_HEIGHT = 267
GRID_ORIGIN_X = 4582523.250853
GRID_ORIGIN_Y = 1095993.140188
NODATA = -9999


def cell_to_projected(row, col):
    return (
        GRID_ORIGIN_X + CELL_M * (col + 0.5),
        GRID_ORIGIN_Y - CELL_M * (row + 0.5),
    )


def projected_to_lat_lon(x, y):
    return (y / MARS_RADIUS_M, x / MARS_RADIUS_M)


def great_circle(a, b):
    p_lat, p_lon = projected_to_lat_lon(a[0], a[1])
    q_lat, q_lon = projected_to_lat_lon(b[0], b[1])
    d_lat = q_lat - p_lat
    d_lon = q_lon - p_lon
    h = (
        math.sin(d_lat / 2) ** 2
        + math.cos(p_lat) * math.cos(q_lat) * math.sin(d_lon / 2) ** 2
    )
    return 2 * MARS_RADIUS_M * math.asin(min(1.0, math.sqrt(h)))


def step_distance(a, b):
    return great_circle(cell_to_projected(*a), cell_to_projected(*b))


def is_traversable(grid, index):
    width = grid["width"]
    height = grid["height"]
    if index < 0 or index >= width * height:
        return False
    if grid["mask"][index] != 1:
        return False
    cost = grid["cost"][index]
    if not math.isfinite(cost) or cost < 1:
        return False
    slope = grid["slope"][index]
    return math.isfinite(slope) and 0 <= slope <= 90


def slope_from_cost(cost):
    out = []
    for c in cost:
        if math.isfinite(c) and c >= 1:
            out.append(10.0 * math.sqrt(c - 1))
        else:
            out.append(NODATA)
    return out


def route(grid, start, end, mode="shortest"):
    """A* matching the old TypeScript ``route()`` output shape."""
    if mode not in ("shortest", "terrain-aware"):
        raise ValueError(f"mode must be shortest or terrain-aware, got {mode}")

    started = time.perf_counter()
    width = grid["width"]
    height = grid["height"]
    size = width * height

    def idx(r, c):
        return r * width + c

    def inside(p):
        return (
            isinstance(p[0], int)
            and isinstance(p[1], int)
            and 0 <= p[0] < height
            and 0 <= p[1] < width
        )

    start = tuple(start)
    end = tuple(end)

    def empty(status):
        return {
            "status": status,
            "mode": mode,
            "path": [],
            "distanceMeters": None,
            "modeledCost": None,
            "objective": None,
            "meanSlopeDeg": None,
            "maxSlopeDeg": None,
            "cells": 0,
            "computationMs": (time.perf_counter() - started) * 1000,
            "warnings": ["Research prototype; friction and slope thresholds are uncalibrated. Not a safety assessment."],
        }

    if not inside(start) or not inside(end):
        return empty("out_of_bounds")
    si = idx(*start)
    ei = idx(*end)
    if not is_traversable(grid, si) or not is_traversable(grid, ei):
        return empty("blocked_endpoint")

    INF = float("inf")
    dist = [INF] * size
    parent = [-1] * size
    # heap entries: (f, h, seq, i, g)
    counter = [0]
    heap = []

    def push(i, g, h):
        f = g + h
        heapq.heappush(heap, (f, h, counter[0], i, g))
        counter[0] += 1

    dist[si] = 0.0
    h0 = step_distance(start, end)
    push(si, 0.0, h0)

    moves = [(-1, 0), (0, -1), (0, 1), (1, 0),
             (-1, -1), (-1, 1), (1, -1), (1, 1)]

    found = False
    while heap:
        f, h, _seq, i, g = heapq.heappop(heap)
        if g != dist[i]:
            continue
        if i == ei:
            found = True
            break
        row = i // width
        col = i % width
        for dr, dc in moves:
            nr, nc = row + dr, col + dc
            if nr < 0 or nc < 0 or nr >= height or nc >= width:
                continue
            ni = idx(nr, nc)
            if not is_traversable(grid, ni):
                continue
            if dr != 0 and dc != 0:
                if not is_traversable(grid, idx(row, nc)):
                    continue
                if not is_traversable(grid, idx(nr, col)):
                    continue
            d = step_distance((row, col), (nr, nc))
            if mode == "terrain-aware":
                weight = (grid["cost"][i] + grid["cost"][ni]) / 2.0
            else:
                weight = 1.0
            ng = g + d * weight
            if ng < dist[ni]:
                dist[ni] = ng
                parent[ni] = i
                nh = step_distance((nr, nc), end)
                push(ni, ng, nh)

    if not found:
        return empty("no_path")

    indices = []
    i = ei
    while i != -1:
        indices.append(i)
        i = parent[i]
    indices.reverse()
    path = [[i // width, i % width] for i in indices]

    distance_meters = 0.0
    modeled_cost = 0.0
    slope_sum = 0.0
    max_slope = float("-inf")
    for k_pos, i in enumerate(indices):
        slope_sum += grid["slope"][i]
        if grid["slope"][i] > max_slope:
            max_slope = grid["slope"][i]
        if k_pos == 0:
            continue
        d = step_distance(path[k_pos - 1], path[k_pos])
        distance_meters += d
        modeled_cost += d * ((grid["cost"][indices[k_pos - 1]] + grid["cost"][i]) / 2.0)

    objective = modeled_cost if mode == "terrain-aware" else distance_meters
    return {
        "status": "ok",
        "mode": mode,
        "path": path,
        "distanceMeters": distance_meters,
        "modeledCost": modeled_cost,
        "objective": objective,
        "meanSlopeDeg": slope_sum / len(indices),
        "maxSlopeDeg": max_slope,
        "cells": len(indices),
        "computationMs": (time.perf_counter() - started) * 1000,
        "warnings": ["Research prototype; friction and slope thresholds are uncalibrated. Not a safety assessment."],
    }


def make_grid(cost, width=GRID_WIDTH, height=GRID_HEIGHT, mask=None, slope=None):
    """Helper to build a grid dict from a flat cost array."""
    if mask is None:
        mask = [1 if (math.isfinite(c) and c >= 1) else 0 for c in cost]
    if slope is None:
        slope = slope_from_cost(cost)
    return {
        "width": width,
        "height": height,
        "cost": list(cost),
        "slope": list(slope),
        "mask": list(mask),
    }
