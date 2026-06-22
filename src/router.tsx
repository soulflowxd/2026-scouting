import { createBrowserRouter } from "react-router"
import { RootRoute } from "@/routes/root"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootRoute />,
    children: [
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
    ],
  },
])
