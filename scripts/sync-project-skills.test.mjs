import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  scanSkills,
  renderAgentsSkillsLine,
  patchAgentsSkillsLine,
  renderInventory,
} from './sync-project-skills.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function writeSkill(root, relDir, name, description = 'desc') {
  const dir = join(root, relDir, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
  )
}

test('scanSkills classifies kit vs project under .claude/skills', () => {
  const root = mkdtempSync(join(repoRoot, '.tmp-skills-inv-'))
  try {
    writeSkill(root, '.claude/skills', 'setup', 'kit setup')
    writeSkill(root, '.claude/skills', 'my-project-skill', 'foreign')
    const skills = scanSkills(root)
    const byName = Object.fromEntries(skills.map((s) => [s.name, s]))
    assert.equal(byName.setup.owner, 'kit')
    assert.equal(byName.setup.path, '.claude/skills/setup')
    assert.equal(byName['my-project-skill'].owner, 'project')
    assert.equal(
      byName['my-project-skill'].path,
      '.claude/skills/my-project-skill',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('renderAgentsSkillsLine and patchAgentsSkillsLine', () => {
  const skills = [
    {
      name: 'setup',
      path: '.claude/skills/setup',
      description: 'x',
      owner: 'kit',
    },
    {
      name: 'custom',
      path: '.claude/skills/custom',
      description: 'y',
      owner: 'project',
    },
  ]
  const line = renderAgentsSkillsLine(skills)
  assert.match(line, /kit — `setup`/)
  assert.match(line, /project — `custom`/)
  const md = '# Agent stack card\n\n- **Skills**: old stuff\n\n## Memory\n'
  const next = patchAgentsSkillsLine(md, line)
  assert.ok(next.includes(line))
  assert.doesNotMatch(next, /old stuff/)
})

test('patchAgentsSkillsLine inserts under Stack when missing', () => {
  const line =
    '- **Skills**: kit — `setup`; project — none. Inventory: `.claude/memory/skills-inventory.md`.'
  const md = '# Card\n\n## Stack\n\n- **App**: x\n\n## Memory\n'
  const next = patchAgentsSkillsLine(md, line)
  assert.ok(next.includes('## Stack\n\n' + line) || next.includes(line))
  assert.match(next, /## Stack/)
})

test('renderInventory lists both sections', () => {
  const md = renderInventory([
    {
      name: 'setup',
      path: '.claude/skills/setup',
      description: 'kit',
      owner: 'kit',
    },
  ])
  assert.match(md, /## Kit \(1\)/)
  assert.match(md, /## Project \(0\)/)
  assert.match(md, /_none_/)
})
