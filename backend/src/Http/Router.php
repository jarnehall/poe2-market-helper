<?php

declare(strict_types=1);

namespace App\Http;

// A handful of routes doesn't need attribute/trie matching — a flat list of
// [method, regex, handler] checked in order is enough.
final class Router
{
    /** @var array<int, array{0: string, 1: string, 2: callable}> */
    private array $routes = [];

    public function get(string $pattern, callable $handler): void
    {
        $this->routes[] = ['GET', $pattern, $handler];
    }

    public function post(string $pattern, callable $handler): void
    {
        $this->routes[] = ['POST', $pattern, $handler];
    }

    public function dispatch(string $method, string $path): void
    {
        foreach ($this->routes as [$routeMethod, $pattern, $handler]) {
            if ($routeMethod === $method && preg_match($pattern, $path)) {
                $handler();

                return;
            }
        }

        JsonResponse::send(['error' => 'Not found'], 404);
    }
}
