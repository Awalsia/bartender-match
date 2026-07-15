export type Bartender = {
  id: string;

  // Corrisponde a profiles.id e auth.users.id.
  // Serve per la tabella swipes.
  userId: string;

  firstName: string | null;
  lastName: string | null;
  city: string | null;
  country: string | null;
  yearsExperience: number | null;
  hourlyRate: number | null;
  currency: string | null;
  bio: string | null;
  photoUrls: string[];
  coverPhotoUrl: string | null;
};
