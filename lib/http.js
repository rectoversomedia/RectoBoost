export function json(data, status = 200) {
  return Response.json(data, { status });
}

export function apiError(error, status = 500) {
  return json({
    error: error.message || "Request failed"
  }, status);
}
