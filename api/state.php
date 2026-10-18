<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function fail(int $status, string $message): void { http_response_code($status); echo json_encode(['error'=>$message], JSON_UNESCAPED_UNICODE); exit; }
if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', ['GET','PUT'], true)) fail(405,'Метод не поддерживается');
$config = dirname(__DIR__, 2) . '/gpro-command-config.php';
if (!is_file($config)) fail(503,'Сервер ещё не настроен');
$settings = require $config;
$key = (string)($settings['admin_key'] ?? '');
$given = (string)($_SERVER['HTTP_X_GPRO_KEY'] ?? '');
if (strlen($key) < 24 || !hash_equals($key, $given)) fail(403,'Неверный ключ администратора');
$folder = dirname(__DIR__, 2) . '/gpro-command-storage';
if (!is_dir($folder) && !mkdir($folder, 0700, true) && !is_dir($folder)) fail(500,'Не удалось создать хранилище');
$file = $folder . '/state.json';
$lock = fopen($folder . '/state.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX)) fail(500,'Не удалось заблокировать хранилище');
$raw = is_file($file) ? file_get_contents($file) : '';
$previous = $raw ? json_decode($raw, true) : null;
$rev = (int)($previous['revision'] ?? 0);
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  echo json_encode(['revision'=>$rev,'state'=>$previous['state'] ?? null], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
  exit;
}
$body = file_get_contents('php://input', false, null, 0, 1048577);
if (!$body || strlen($body) > 1048576) fail(413,'Максимальный размер данных — 1 МБ');
$input = json_decode($body, true);
if (!is_array($input) || !isset($input['state']) || !is_array($input['state']) || !isset($input['state']['projects']) || !is_array($input['state']['projects'])) fail(400,'Неверный формат данных');
if (!isset($input['revision']) || !is_int($input['revision'])) fail(400,'Не указана версия данных');
if ($input['revision'] !== $rev) fail(409,'Данные изменены на другом устройстве. Обновите страницу.');
$new = json_encode(['revision'=>$rev+1,'state'=>$input['state'],'updated_at'=>gmdate('c')], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
if ($new === false) fail(400,'Ошибка кодирования');
$tmp = tempnam($folder, 'state_');
if ($tmp === false || file_put_contents($tmp, $new, LOCK_EX) === false || !rename($tmp, $file)) fail(500,'Не удалось сохранить');
echo json_encode(['revision'=>$rev+1,'ok'=>true]);
