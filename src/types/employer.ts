export type Employer = {
  id: string;

  // Corrisponde a profiles.id e auth.users.id.
  // Serve per salvare gli swipe.
  userId: string;

  businessName: string | null;
  city: string | null;
  country: string | null;
  description: string | null;
  barType: string | null;
  hourlyRateOffered: number | null;
  currency: string | null;

  photoUrls: string[];
  coverPhotoUrl: string | null;
};
