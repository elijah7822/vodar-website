# VODAR local end-to-end smoke test (run against `wrangler pages dev . --port 8788`)
$base = 'http://127.0.0.1:8788'
$script:fail = 0
function Step($name, $ok, $detail = '') {
  if ($ok) { Write-Host ("PASS  {0}  {1}" -f $name, $detail) }
  else { Write-Host ("FAIL  {0}  {1}" -f $name, $detail); $script:fail++ }
}

try { $products = (Invoke-RestMethod "$base/api/products").products } catch { $products = @() }
Step 'products list' ($products.Count -ge 1) ("count=" + $products.Count)

$payload = @{
  name = 'Test Buyer'; email = 'buyer@example.com'; address = '1 Main St'
  city = 'Berlin'; country = 'Germany'; zip = '10115'
  items = @(@{ id = 'P1'; qty = 1 }, @{ id = 'P2'; qty = 2 })
} | ConvertTo-Json -Depth 5
$o1 = Invoke-RestMethod -Method Post -Uri "$base/api/order/create" -ContentType 'application/json' -Body $payload
Step 'order create' ($o1.order -like 'VOD-*') ("order=" + $o1.order)
Step 'server-side total' ($o1.total_amt -eq 13000) ("total=" + $o1.total_amt)

$o2 = Invoke-RestMethod -Method Post -Uri "$base/api/order/create" -ContentType 'application/json' -Body $payload
Step 'idempotency 60s' ($o2.order -eq $o1.order -and $o2.duplicate) ("order=" + $o2.order)

$p = Invoke-RestMethod -Method Post -Uri "$base/api/order/$($o1.order)/pay"
Step 'mock pay' ($p.status -eq 'paid') ("status=" + $p.status)

$t = (Invoke-RestMethod "$base/api/order/$($o1.order)").order
Step 'track shows paid' ($t.status -eq 'paid')
Step 'email masked' ($t.email_hint -eq 'b***@example.com') ("hint=" + $t.email_hint)
Step 'no address/email leak' (-not $t.PSObject.Properties['address'] -and -not $t.PSObject.Properties['email'])

try {
  Invoke-RestMethod -Method Post -Uri "$base/api/order/$($o1.order)/aftersales" -ContentType 'application/json' `
    -Body (@{ type = 'return_refund'; subject = 'x'; detail = 'y'; email = 'wrong@example.com'; items = @(@{ product_id = 'P1'; qty = 1 }) } | ConvertTo-Json -Depth 4) | Out-Null
  Step 'aftersales wrong email rejected' $false
} catch { Step 'aftersales wrong email rejected' ($_.Exception.Response.StatusCode.value__ -eq 403) ("code=" + $_.Exception.Response.StatusCode.value__) }

$as = Invoke-RestMethod -Method Post -Uri "$base/api/order/$($o1.order)/aftersales" -ContentType 'application/json' `
  -Body (@{ type = 'return_refund'; subject = 'Broken strap'; detail = 'Strap snapped after one week'; email = 'buyer@example.com'; items = @(@{ product_id = 'P1'; qty = 1 }) } | ConvertTo-Json -Depth 4)
Step 'aftersales accepted + mail attempted' ($as.ok -and $as.email.customer -eq 'skipped' -and $as.email.admin -eq 'skipped') ("id=" + $as.id)

$asDup = Invoke-RestMethod -Method Post -Uri "$base/api/order/$($o1.order)/aftersales" -ContentType 'application/json' `
  -Body (@{ type = 'return_refund'; subject = 'Broken strap'; detail = 'Strap snapped after one week'; email = 'buyer@example.com'; items = @(@{ product_id = 'P1'; qty = 1 }) } | ConvertTo-Json -Depth 4)
Step 'aftersales duplicate suppressed' ($asDup.duplicate -and $asDup.id -eq $as.id)

try {
  Invoke-RestMethod "$base/api/admin/orders" | Out-Null
  Step 'admin requires login' $false
} catch { Step 'admin requires login' ($_.Exception.Response.StatusCode.value__ -eq 401) ("code=" + $_.Exception.Response.StatusCode.value__) }

$login = Invoke-WebRequest -Method Post -Uri "$base/api/admin/login" -ContentType 'application/json' `
  -Body (@{ password = 'local-test-only' } | ConvertTo-Json) -SessionVariable sess -UseBasicParsing
Step 'admin login' ($login.StatusCode -eq 200)

$ship = Invoke-RestMethod -Method Post -Uri "$base/api/admin/tracking" -ContentType 'application/json' -WebSession $sess `
  -Body (@{ order_id = $o1.order; carrier = 'DHL'; tracking_no = '1234567890' } | ConvertTo-Json)
Step 'ship + tracking' ($ship.ok)

$t2 = (Invoke-RestMethod "$base/api/order/$($o1.order)").order
Step 'buyer sees shipped' ($t2.status -eq 'shipped') ("tracking=" + $t2.tracking[0].carrier + '/' + $t2.tracking[0].tracking_no)

$comp = Invoke-RestMethod -Method Post -Uri "$base/api/admin/tracking" -ContentType 'application/json' -WebSession $sess `
  -Body (@{ order_id = $o1.order; action = 'complete' } | ConvertTo-Json)
$t3 = (Invoke-RestMethod "$base/api/order/$($o1.order)").order
Step 'complete order' ($comp.ok -and $t3.status -eq 'completed') ("status=" + $t3.status)

$aupd = Invoke-RestMethod -Method Post -Uri "$base/api/admin/aftersales" -ContentType 'application/json' -WebSession $sess `
  -Body (@{ id = $as.id; status = 'refunded'; resolution = 'Refund completed'; internal_note = 'Verified manually'; refund_status = 'completed'; refund_amount = 10000; refund_reference = 'LOCAL-REF-1' } | ConvertTo-Json)
$t4 = (Invoke-RestMethod "$base/api/order/$($o1.order)").order
Step 'admin records refund' ($aupd.ok -and $t4.aftersales[0].status -eq 'refunded' -and $t4.aftersales[0].refund_amount -eq 10000 -and $t4.aftersales[0].items[0].product_id -eq 'P1')
Step 'internal note remains private' (-not $t4.aftersales[0].PSObject.Properties['internal_note'])

Invoke-RestMethod -Method Post -Uri "$base/api/admin/products" -ContentType 'application/json' -WebSession $sess `
  -Body (@{ id = 'P3'; active = $false } | ConvertTo-Json) | Out-Null
try {
  Invoke-RestMethod -Method Post -Uri "$base/api/order/create" -ContentType 'application/json' `
    -Body (@{ name = 'T'; email = 'b2@example.com'; address = 'a'; city = 'c'; country = 'd'; zip = ''; items = @(@{ id = 'P3'; qty = 1 }) } | ConvertTo-Json -Depth 5) | Out-Null
  Step 'inactive product rejected' $false
} catch { Step 'inactive product rejected' ($_.Exception.Response.StatusCode.value__ -eq 400) ("code=" + $_.Exception.Response.StatusCode.value__) }
Invoke-RestMethod -Method Post -Uri "$base/api/admin/products" -ContentType 'application/json' -WebSession $sess `
  -Body (@{ id = 'P3'; active = $true } | ConvertTo-Json) | Out-Null

$codes = @()
for ($i = 1; $i -le 5; $i++) {
  try {
    Invoke-RestMethod -Method Post -Uri "$base/api/admin/login" -ContentType 'application/json' `
      -Body (@{ password = "wrong$i" } | ConvertTo-Json) | Out-Null; $codes += 200
  } catch { $codes += $_.Exception.Response.StatusCode.value__ }
}
Step 'rate limit locks at 5' ($codes[4] -eq 429) ("codes=" + ($codes -join ','))
try {
  Invoke-RestMethod -Method Post -Uri "$base/api/admin/login" -ContentType 'application/json' `
    -Body (@{ password = 'local-test-only' } | ConvertTo-Json) | Out-Null
  Step 'lock holds even with right password' $false
} catch { Step 'lock holds even with right password' ($_.Exception.Response.StatusCode.value__ -eq 429) ("code=" + $_.Exception.Response.StatusCode.value__) }

Write-Host ("`nRESULT: {0} failure(s)" -f $script:fail)
exit $script:fail
