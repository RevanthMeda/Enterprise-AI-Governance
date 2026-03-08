-- Pre-checks: run and ensure all counts are zero before applying NOT NULL.
SELECT 'ai_systems' AS table_name, COUNT(*)::int AS null_count FROM ai_systems WHERE organization_id IS NULL
UNION ALL
SELECT 'system_controls', COUNT(*)::int FROM system_controls WHERE organization_id IS NULL
UNION ALL
SELECT 'approval_workflows', COUNT(*)::int FROM approval_workflows WHERE organization_id IS NULL
UNION ALL
SELECT 'audit_logs', COUNT(*)::int FROM audit_logs WHERE organization_id IS NULL
UNION ALL
SELECT 'notifications', COUNT(*)::int FROM notifications WHERE organization_id IS NULL
UNION ALL
SELECT 'evidence_files', COUNT(*)::int FROM evidence_files WHERE organization_id IS NULL
UNION ALL
SELECT 'risk_assessments', COUNT(*)::int FROM risk_assessments WHERE organization_id IS NULL;

SELECT 'ai_systems' AS table_name, COUNT(*)::int AS orphan_count
FROM ai_systems t LEFT JOIN organizations o ON o.id = t.organization_id
WHERE t.organization_id IS NOT NULL AND o.id IS NULL
UNION ALL
SELECT 'system_controls', COUNT(*)::int
FROM system_controls t LEFT JOIN organizations o ON o.id = t.organization_id
WHERE t.organization_id IS NOT NULL AND o.id IS NULL
UNION ALL
SELECT 'approval_workflows', COUNT(*)::int
FROM approval_workflows t LEFT JOIN organizations o ON o.id = t.organization_id
WHERE t.organization_id IS NOT NULL AND o.id IS NULL
UNION ALL
SELECT 'audit_logs', COUNT(*)::int
FROM audit_logs t LEFT JOIN organizations o ON o.id = t.organization_id
WHERE t.organization_id IS NOT NULL AND o.id IS NULL
UNION ALL
SELECT 'notifications', COUNT(*)::int
FROM notifications t LEFT JOIN organizations o ON o.id = t.organization_id
WHERE t.organization_id IS NOT NULL AND o.id IS NULL
UNION ALL
SELECT 'evidence_files', COUNT(*)::int
FROM evidence_files t LEFT JOIN organizations o ON o.id = t.organization_id
WHERE t.organization_id IS NOT NULL AND o.id IS NULL
UNION ALL
SELECT 'risk_assessments', COUNT(*)::int
FROM risk_assessments t LEFT JOIN organizations o ON o.id = t.organization_id
WHERE t.organization_id IS NOT NULL AND o.id IS NULL;

-- Apply only after pre-checks pass in all target environments.
ALTER TABLE ai_systems ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE system_controls ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE approval_workflows ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE audit_logs ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE notifications ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE evidence_files ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE risk_assessments ALTER COLUMN organization_id SET NOT NULL;
