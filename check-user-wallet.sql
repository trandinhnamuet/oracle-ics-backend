-- Kiểm tra wallet của user admin (id: 8)
SELECT 
    u.id as user_id,
    u.email,
    u.first_name,
    u.last_name,
    uw.id as wallet_id,
    uw.balance,
    uw.created_at as wallet_created_at
FROM users u
LEFT JOIN user_wallets uw ON u.id = uw.user_id
WHERE u.id = 8;

-- Kiểm tra cloud package với id = 1
SELECT 
    id,
    package_name,
    cost_vnd,
    is_active
FROM cloud_packages
WHERE id = 1;

-- Kiểm tra các wallet transactions gần đây của user
SELECT 
    wt.id,
    wt.wallet_id,
    wt.payment_id,
    wt.change_amount,
    wt.balance_after,
    wt.type,
    wt.created_at
FROM wallet_transactions wt
JOIN user_wallets uw ON wt.wallet_id = uw.id
WHERE uw.user_id = 8
ORDER BY wt.created_at DESC
LIMIT 10;
