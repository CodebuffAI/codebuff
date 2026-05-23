// Copyright (c) 2010 LearnBoost <tj@learnboost.com>
#pragma once

template <typename T>
class Point {
  public:
    T x, y;
    Point(T x=0, T y=0): x(x), y(y) {}
    Point(const Point&) = default;
    Point& operator=(const Point&) = default;
};
