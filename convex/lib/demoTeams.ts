export function needsEventStats(team: { teamNumber?: number; nickname?: string; tbaTeamKey?: string; eventTeamAlias?: string }) {
  return (team.teamNumber !== undefined && team.teamNumber >= 9900 && team.teamNumber <= 9999)
    || /off[ -]?season.*demo|demo.*team/i.test(team.nickname ?? "")
    || /\d+[a-z]$/i.test(team.eventTeamAlias ?? "")
    || /^frc\d+[a-z]$/i.test(team.tbaTeamKey ?? "")
}
