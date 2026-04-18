export type Route = {
  routeId: string;
  routeName: string;
  schoolId: string;
  areas: string[];

  activeBusId: string; // ✅ KEEP THIS

  isDeleted: boolean;
  createdAt: number;
  updatedAt: number;
};