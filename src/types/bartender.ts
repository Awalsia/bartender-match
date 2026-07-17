export type Bartender = {
  id: string;

  firstName: string | null;
  lastName: string | null;

  city: string | null;
  country: string | null;

  yearsExperience: number | null;
  hourlyRate: number | null;
  currency: string | null;

  bio: string | null;

  coverPhotoUrl: string | null;
  photoUrls: string[];
};
