import { z } from 'zod'

export const GIDX_DOCUMENTS_REQUIRED = 2

export const GPSProps = z.object({
  Latitude: z.number(),
  Longitude: z.number(),
  Radius: z.number(),
  Altitude: z.number(),
  Speed: z.number(),
  DateTime: z.string(),
})

export const verificationParams = z.object({
  FirstName: z.string(),
  LastName: z.string(),
  DeviceGPS: GPSProps,
  DateOfBirth: z.string(),
  CitizenshipCountryCode: z.string(),
  // Must supply address or ID info
  AddressLine1: z.string().optional(),
  AddressLine2: z.string().optional(),
  City: z.string().optional(),
  StateCode: z.string().optional(),
  PostalCode: z.string().optional(),
  CountryCode: z.string().optional(),
  IdentificationTypeCode: z.number().gte(1).lte(4).optional(),
  IdentificationNumber: z.string().optional(),
  // TODO: remove these in production
  DeviceIpAddress: z.string(),
  EmailAddress: z.string(),
  MerchantCustomerID: z.string(),
})

export const checkoutParams = {
  MerchantTransactionID: z.string(),
  MerchantSessionID: z.string(),
  PaymentAmount: z.object({
    mana: z.number(),
    price: z.number(),
    bonus: z.number(),
  }),
  PaymentMethod: z.object({
    Type: z.enum(['CC']), // TODO: add 'ACH'
    NameOnAccount: z.string(),
    SavePaymentMethod: z.boolean(),
    BillingAddress: z.object({
      City: z.string(),
      AddressLine1: z.string(),
      StateCode: z.string(),
      PostalCode: z.string(),
      CountryCode: z.string(),
    }),
    // CC specific fields,
    creditCard: z.object({
      CardNumber: z.string(),
      CVV: z.string(),
      ExpirationDate: z.string(),
    }),
    // .optional(),
    // ach: z
    //   .object({
    //     AccountNumber: z.string(),
    //     RoutingNumber: z.string(),
    //   })
    //   .optional(),
    // For saved payment methods:
    saved: z
      .object({
        Token: z.string(),
        DisplayName: z.string(),
      })
      .optional(),
  }),
}

export const cashoutParams = z.object({
  ...checkoutParams,
  PaymentAmount: z.object({
    manaCash: z.number(),
    dollars: z.number(),
  }),
  SavePaymentMethod: z.boolean(),
  PaymentMethod: z.object({
    Type: z.enum(['ACH']),
    NameOnAccount: z.string(),
    BillingAddress: z.object({
      City: z.string(),
      AddressLine1: z.string(),
      StateCode: z.string(),
      PostalCode: z.string(),
      CountryCode: z.string(),
    }),
    AccountNumber: z.string(),
    RoutingNumber: z.string(),
  }),
})

export type DocumentRegistrationResponse = {
  ResponseCode: number
  ResponseMessage: string
  MerchantCustomerID: string
  Document: GIDXDocument
}
export type GIDXDocument = {
  DocumentID: string
  CategoryType: number
  DocumentStatus: number
  FileName: string
  FileSize: number
  DateTime: string
  DocumentNotes: DocumentNote[]
}

export type DocumentNote = {
  AuthorName: string
  NoteText: string
  DateTime: string
}

export type GPSData = {
  Radius: number
  Altitude: number
  Latitude: number
  Longitude: number
  Speed: number
  DateTime: string
}

export const idNameToCategoryType = {
  'Drivers License': 2,
  Passport: 3,
  'Military Id': 4,
  'Government Photo Id': 5,
  'Student Photo Id': 6,
  'Utility Bill': 7,
  Other: 1,
}

export type GIDXCustomerProfile = {
  MerchantCustomerID: string
  ReasonCodes: string[]
  ProfileVerificationStatus: string
  FraudConfidenceScore: number
  IdentityConfidenceScore: number
  ResponseCode: number
  ResponseMessage: string
  // There are many more at https://www.tsevo.com/Docs/CustomerIdentity
}

export type GIDXRegistrationResponse = {
  MerchantCustomerID: string
  ReasonCodes: string[]
  WatchChecks: WatchCheckType[]
  ProfileMatch: ProfileMatchType
  IdentityConfidenceScore: number
  FraudConfidenceScore: number
  CustomerRegistrationLink: string
  LocationDetail: LocationDetailType
  ResponseCode: number
  ResponseMessage: string
  ProfileMatches: ProfileMatchType[]
}

type WatchCheckType = {
  SourceCode: string
  SourceScore: number
  MatchResult: boolean
  MatchScore: number
}

type ProfileMatchType = {
  NameMatch: boolean
  AddressMatch: boolean
  EmailMatch: boolean
  IdDocumentMatch: boolean
  PhoneMatch: boolean
  MobilePhoneMatch: boolean
  DateOfBirthMatch: boolean
  CitizenshipMatch: boolean
}

type LocationDetailType = {
  Latitude: number
  Longitude: number
  Radius: number
  Altitude: number
  Speed: number
  LocationDateTime: string
  LocationStatus: number
  LocationServiceLevel: string
  ReasonCodes: string[]
  ComplianceLocationStatus: boolean
  ComplianceLocationServiceStatus: string
  IdentifierType: string
  IdentifierUsed: string
}

export type GIDXMonitorResponse = {
  MerchantCustomerID: string
  ReasonCodes: string[]
  WatchChecks: WatchCheckType[]
  ProfileVerificationStatus: string
  IdentityConfidenceScore: number
  FraudConfidenceScore: number
  LocationDetail: LocationDetailType
  ResponseCode: number
  ResponseMessage: string
}
export type CashierLimit = {
  MinAmount: number
  MaxAmount: number
}

export type PaymentAmount = {
  mana: number
  price: number
  bonus: number
}
export type PaymentMethod = {
  Token: string
  DisplayName: string
  Type: 'CC' | 'ACH' | 'Paypal' | 'ApplePay' | 'GooglePay'
  NameOnAccount: string
  BillingAddress: {
    AddressLine1: string
    City: string
    StateCode: string
    PostalCode: string
    CountryCode: string
  }
  PhoneNumber?: string
  // CC specific fields
  CardNumber?: string
  CVV?: string
  ExpirationDate?: string
  Network?: string
  AVSResult?: string
  CVVResult?: string
  ThreeDS?: {
    CAVV: string
    ECI: string
    DSTransactionID: string
  }
  // ACH specific fields
  AccountNumber?: string
  RoutingNumber?: string
  // ApplePay specific fields
  Payment?: string
  WalletToken?: string
  // GooglePay specific fields
  PaymentData?: string
}
export type PaymentMethodSetting =
  | {
      Type: 'CC' | 'ACH' | 'ApplePay'
    }
  | {
      Type: 'Paypal'
      ClientID: string
    }
  | {
      Type: 'GooglePay'
      Environment: string
      Gateway: string
      GatewayMerchantID: string
      MerchantID: string
    }

export type CheckoutSession = {
  MerchantTransactionID: string
  MerchantSessionID: string
  CashierLimits: CashierLimit[]
  PaymentAmounts: PaymentAmount[]
  PaymentMethods: PaymentMethod[]
  PaymentMethodSettings: PaymentMethodSetting[]
  CustomerProfile: {
    Address: Address
    Name: Name
  }
}

export type CheckoutSessionResponse = {
  ApiKey: string
  ApiVersion: number
  SessionID: string
  MerchantID: string
  MerchantSessionID: string
  ResponseCode: number
  ResponseMessage: string
  ReasonCodes: string[]
} & CheckoutSession

export const ID_ERROR_MSG =
  'Registration failed, identity error. Check your identifying information.'

export const exampleCustomers = [
  {
    EmailAddress: 'mradamgibbs@gmail.com',
    MobilePhoneNumber: '5785785789',
    DeviceIpAddress: '194.207.197.157',
    FirstName: 'Adam',
    LastName: 'Gibbs',
    DateOfBirth: '01/11/1979',
    CitizenshipCountryCode: 'GB',
    IdentificationTypeCode: 2,
    IdentificationNumber: '123456789',
    AddressLine1: '133 Hall Road',
    City: 'Hull',
    StateCode: '',
    PostalCode: 'Hu6 8qj',
    DeviceGPS: {
      Latitude: 53.744339,
      Longitude: -0.33244,
      Radius: 11.484,
      Altitude: 0,
      Speed: 0,
      DateTime: new Date().toISOString(),
    },
  },
  {
    EmailAddress: 'gochanman@yahoo.com',
    MobilePhoneNumber: '4042818372',
    DeviceIpAddress: '24.147.127.6',
    FirstName: 'Corey',
    LastName: 'Chandler',
    DateOfBirth: '09/28/1987',
    CitizenshipCountryCode: 'US',
    IdentificationTypeCode: 2,
    IdentificationNumber: '123456789',
    AddressLine1: '66 Forest Street',
    City: 'Reading',
    StateCode: 'MA',
    PostalCode: '01867',
    DeviceGPS: {
      // utah (blocked):
      // Latitude: 40.7608,
      // Longitude: -111.891,
      Latitude: 39.615342,
      Longitude: -112.183449,
      Radius: 11.484,
      Altitude: 0,
      Speed: 0,
      DateTime: new Date().toISOString(),
    },
  },
  {
    EmailAddress: 'andsief123@yahoo.com',
    MobilePhoneNumber: '4042818372',
    DeviceIpAddress: '73.16.248.173',
    FirstName: 'Andrew',
    LastName: 'Siegfried',
    DateOfBirth: '01/27/1978',
    CitizenshipCountryCode: 'US',
    IdentificationTypeCode: 2,
    IdentificationNumber: '123456789',
    AddressLine1: '321 Greenwood Lane',
    City: 'Williston',
    StateCode: 'VT',
    PostalCode: '05495',
    DeviceGPS: {
      Latitude: 44.064107,
      Longitude: -72.545022,
      Radius: 11.484,
      Altitude: 0,
      Speed: 0,
      DateTime: new Date().toISOString(),
    },
  },
  {
    EmailAddress: 'playfree9800@gmail.com',
    MobilePhoneNumber: '4042818372',
    DeviceIpAddress: '99.100.24.160',
    FirstName: 'Antron',
    LastName: 'Hurt',
    DateOfBirth: '11/06/1986',
    CitizenshipCountryCode: 'US',
    IdentificationTypeCode: 2,
    IdentificationNumber: '123456789',
    AddressLine1: '214 Rosemont Ave',
    City: 'Modesto',
    StateCode: 'CA',
    PostalCode: '95351',
    DeviceGPS: {
      Latitude: 37.774929,
      Longitude: -122.419418,
      Radius: 11.484,
      Altitude: 0,
      Speed: 0,
      DateTime: new Date().toISOString(),
    },
  },
]

type Action = {
  Type: string
  URL: string
  ClientID: string
  OrderID: string
}
export type PaymentDetail = {
  PaymentStatusCode: string
  PaymentStatusMessage: string
  PaymentAmountType: string
  PaymentAmount: number
  CurrencyCode: string
  PaymentAmountCode: string
  PaymentMethodType: string
  PaymentMethodAccount: string
  PaymentApprovalDateTime: string
  PaymentStatusDateTime: string
  PaymentProcessDateTime: string
  ProcessorName: string
  ProcessorTransactionID: string
  ProcessorResponseCode: number
  ProcessorResponseMessage: string
  Action: Action
  FinancialConfidenceScore: number
  Recurring: boolean
  RecurringInterval?: string
  NextRecurringDate?: string
}
export type CompleteSessionDirectCashierResponse = {
  ReasonCodes: string[]
  SessionID: string
  SessionStatusCode: number
  SessionStatusMessage: string
  MerchantTransactionID: string
  AllowRetry: boolean
  Action: Action
  FinancialConfidenceScoreString: number
  PaymentDetails: PaymentDetail[]
}
type Address = {
  AddressLine1: string
  AddressLine2: string
  City: string
  State: string
  StateCode: string
  PostalCode: string
  Country: string
  IdentityConfidenceScore: number
  Primary: boolean
}

type Name = {
  FirstName: string
  LastName: string
  MiddleName: string
  IdentityConfidenceScore: number
  Primary: boolean
}
export type CustomerProfileResponse = {
  MerchantCustomerID: string
  ReasonCodes: string[]
  WatchChecks: WatchCheckType[]
  Name: Name[]
  Address: Address[]
  Citizenship: {
    CountryCode: string
    IdentityConfidenceScore: number
    DateAcquired: string
  }[]
  DateOfBirth: {
    PlaceOfBirth: string
    DateOfBirth: string
    IdentityConfidenceScore: number
  }[]
}
