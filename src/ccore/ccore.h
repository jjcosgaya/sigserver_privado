#pragma once
#include <node_api.h>
#include <stdbool.h>

typedef struct rect_t {
	double x;
	double y;
	double w;
	double h;
} rect_t;

bool rect_intersects(rect_t a, rect_t b);

#define NAPI_CALLBACK(name) napi_value (name)(napi_env env, napi_callback_info info)
#define NAPI_OK(op) assert((op) == napi_ok)
