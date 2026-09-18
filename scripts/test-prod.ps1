# VODAR production smoke test (curl-based, run against https://vodar.net)
# Skips: rate-limit lock test (would lock tester IP 15 min) - validated locally already.
param([string]$Base = 'https://vodar.net')
$script:fail = 0
function Step($name, $ok, $detail = '') {
  if ($ok) { Write-Host ("PASS  {0}  {1}" -f $name, $detail) }
  else { Write-Host ("FAIL  {0}  {1}" -f $name, $detail); $script:fail++ }
}

function HttpCurl($method, $url, $json = $null) {
  $a = @('-s', '--max-time', '40', '-w', "`n%{http_code}", '-X', $method)
  if ($json -ne $null) { $a += @('-H', 'Content-Type: application/json') }
  $a += $url
  if ($json -ne $null) { $out = $json | & curl.exe @a -d '@-' } else { $out = & curl.exe @a }
  $lines = @($out)
  $code = [int]($lines[-1])
  $body = if ($lines.Count -gt 1) { ($lines[0..($lines.Count - 2)] -join "`n") } else { '' }
  return @{ code = $code; body = $body }
}

$script:order = $null

$r = HttpCurl 'GET' "$Base/api/products"
$products = @(); try { $products = ($r.body | ConvertFrom-Json).products } catch {}
Step 'products list' ($r.code -eq 200 -and $products.Count -ge 3) ("http=" + $r.code + " count=" + $products.Count)

$email = 'prod-smoke@example.com'
$payload = @{
  name = 'Prod Smoke'; email = $email; address = '1 Main St'
  city = 'Berlin'; country = 'Germany'; zip = '10115'
  items = @(@{ id = 'P1'; qty = 1 }, @{ id = 'P2'; qty = 2 })
} | ConvertTo-Json -Depth 5
$r = HttpCurl 'POST' "$Base/api/order/create" $payload
$o1 = $null; try { $o1 = $r.body | ConvertFrom-Json } catch {}
$script:order = $o1.order
Step 'order create' ($r.code -eq 200 -and $o1.order -like 'VOD-*') ("http=" + $r.code + " order=" + $o1.order)
Step 'server-side total' ($o1.total_amt -eq 13000) ("total=" + $o1.total_amt)

$r = HttpCurl 'POST' "$Base/api/order/create" $payload
$o2 = $null; try { $o2 = $r.body | ConvertFrom-Json } catch {}
Step 'idempotency 60s' ($o2.order -eq $o1.order -and $o2.duplicate) ("order=" + $o2.order)

$r = HttpCurl 'POST' "$Base/api/order/$($o1.order)/pay"
$p = $null; try { $p = $r.body | ConvertFrom-Json } catch {}
Step 'mock pay' ($r.code -eq 200 -and $p.status -eq 'paid') ("status=" + $p.status)

$r = HttpCurl 'GET' "$Base/api/order/$($o1.order)"
$t = $null; try { $t = ($r.body | ConvertFrom-Json).order } catch {}
Step 'track shows paid' ($t.status -eq 'paid')
Step 'email masked' ($t.email_hint -eq 'p***@example.com') ("hint=" + $t.email_hint)
Step 'no address/email leak' ($t -and -not $t.PSObject.Properties['address'] -and -not $t.PSObject.Properties['email'])

$r = HttpCurl 'POST' "$Base/api/order/$($o1.order)/aftersales" (@{ type = 'return'; subject = 'x'; detail = 'y'; email = 'wrong@example.com' } | ConvertTo-Json)
Step 'aftersales wrong email rejected' ($r.code -eq 403) ("code=" + $r.code)

$r = HttpCurl 'POST' "$Base/api/order/$($o1.order)/aftersales" (@{ type = 'return'; subject = 'Broken strap'; detail = 'Prod smoke test ticket'; email = $email } | ConvertTo-Json)
$as = $null; try { $as = $r.body | ConvertFrom-Json } catch {}
Step 'aftersales accepted' ($r.code -eq 200 -and $as.ok) ("id=" + $as.id)

$r = HttpCurl 'GET' "$Base/api/admin/orders"
Step 'admin requires login' (($r.code -eq 401 -or $r.code -eq 503) -and ($r.body -match 'Unauthorized')) ("code=" + $r.code + " (503 until ADMIN_PASSWORD secret is set)")

$pages = @(@{u='/';n='storefront'}, @{u='/admin';n='admin page'}, @{u='/privacy';n='privacy policy'}, @{u='/returns';n='return policy'})
foreach ($pg in $pages) {
  $r = HttpCurl 'GET' "$Base$($pg.u)"
  Step ("page " + $pg.n) ($r.code -eq 200 -and $r.body.Length -gt 1000) ("http=" + $r.code + " bytes=" + $r.body.Length)
}

Write-Host ("`nSMOKE ORDER: {0}" -f $script:order)
Write-Host ("RESULT: {0} failure(s)" -f $script:fail)
exit $script:fail
