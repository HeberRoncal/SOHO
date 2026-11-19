UPDATE `marcas`
SET `codigo` = CASE `slug`
    WHEN 'asics' THEN 'AS'
    WHEN 'reebok' THEN 'RB'
    WHEN 'skechers' THEN 'SK'
    WHEN 'under-armour' THEN 'UA'
    ELSE `codigo`
END
WHERE (`slug` = 'asics' AND `codigo` = 'ASICS')
   OR (`slug` = 'reebok' AND `codigo` = 'REEBOK')
   OR (`slug` = 'skechers' AND `codigo` = 'SKECHERS')
   OR (`slug` = 'under-armour' AND `codigo` = 'UNDERARMOUR');
