import json
import math
import sys


def read_metric(route, name, required=False):
    """Read a non-negative numeric metric from a route's metrics object."""
    if not isinstance(route, dict) or not isinstance(route.get("metrics"), dict):
        raise ValueError("Each route must contain a metrics object.")

    value = route["metrics"].get(name)

    if value is None:
        if required:
            raise ValueError(f"Metric '{name}' is required.")
        return None

    if (
        type(value) not in (int, float)
        or not math.isfinite(value)
        or value < 0
    ):
        raise ValueError(f"Metric '{name}' must be a finite non-negative number.")

    return value


def difference(baseline, comparison):
    """Return comparison minus baseline, with a percentage when defined."""
    if baseline is None or comparison is None:
        return {"absolute": None, "percent": None}

    delta = comparison - baseline

    return {
        "absolute": round(delta, 2),
        # A percentage relative to zero is undefined.
        "percent": round(delta / baseline * 100, 2) if baseline != 0 else None,
    }


def compare_routes(data):
    if not isinstance(data, dict):
        raise ValueError("Input must be a JSON object.")

    distance_route = data.get("distance_route")
    terrain_route = data.get("terrain_route")

    distance_a = read_metric(distance_route, "distance_m", required=True)
    distance_b = read_metric(terrain_route, "distance_m", required=True)
    cost_a = read_metric(distance_route, "cost")
    cost_b = read_metric(terrain_route, "cost")

    return {
        "status": "ok",
        "difference_direction": "terrain_route minus distance_route",
        "routes": {
            "distance_route": {"distance_m": distance_a, "cost": cost_a},
            "terrain_route": {"distance_m": distance_b, "cost": cost_b},
        },
        "differences": {
            "distance_m": difference(distance_a, distance_b),
            "cost": difference(cost_a, cost_b),
        },
        "cost_status": (
            "compared" if cost_a is not None and cost_b is not None
            else "not_available"
        ),
    }


def main():
    try:
        data = json.load(sys.stdin)
        result = compare_routes(data)
    except (json.JSONDecodeError, ValueError) as error:
        result = {"status": "error", "message": str(error)}

    print(json.dumps(result))
    return 1 if result["status"] == "error" else 0


if __name__ == "__main__":
    sys.exit(main())
    