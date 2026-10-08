import { createBrowserRouter } from "react-router"
import { RootRoute } from "@/routes/root"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootRoute />,
    children: [
      { path: "*", lazy: async () => ({ Component: (await import("@/routes/not-found")).NotFoundRoute }) },
      { path: "team-mash", lazy: async () => ({ Component: (await import("@/routes/team-mash")).TeamMashRoute }) },
      { path: "account", lazy: async () => ({ Component: (await import("@/routes/account")).AccountRoute }) },
      {
        index: true,
        lazy: async () => ({
          Component: (await import("@/routes/teams")).TeamsRoute,
        }),
      },
      {
        path: "event",
        lazy: async () => ({
          Component: (await import("@/routes/event-setup")).EventSetupRoute,
        }),
      },
      {
        path: "admin",
        lazy: async () => ({
          Component: (await import("@/routes/admin")).AdminRoute,
        }),
      },
      {
        path: "teams",
        lazy: async () => ({
          Component: (await import("@/routes/teams")).TeamsRoute,
        }),
      },
      {
        path: "pit",
        lazy: async () => ({
          Component: (await import("@/routes/pit-scouting")).PitScoutingRoute,
        }),
      },
      {
        path: "matches",
        lazy: async () => ({
          Component: (await import("@/routes/match-scouting")).MatchScoutingRoute,
        }),
      },
      {
        path: "pick-lists",
        lazy: async () => ({
          Component: (await import("@/routes/pick-lists")).PickListsRoute,
        }),
      },
      {
        path: "strategy",
        lazy: async () => ({ Component: (await import("@/routes/strategy-board")).StrategyBoardRoute }),
      },
    ],
  },
])
