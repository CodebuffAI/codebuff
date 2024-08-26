import { Request, Response } from 'express'
import { getPrivateUser } from 'shared/utils'
import { PrivateUser } from 'common/user'
import { NOTIFICATION_DESCRIPTIONS } from 'common/notification'
import { notification_preference } from 'common/user-notification-preferences'
import { getApiUrl } from 'common//api/utils'
import { trackPublicEvent } from 'shared/analytics'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updatePrivateUser } from 'shared/supabase/users'

export const unsubscribe = async (req: Request, res: Response) => {
  const id = req.query.id as string
  const type = req.query.type as string
  if (!id || !type) {
    res.status(400).send('Empty id or subscription type parameter.')
    return
  }
  console.log(`Unsubscribing ${id} from ${type}`)
  const notificationSubscriptionType = type as notification_preference
  if (notificationSubscriptionType === undefined) {
    res.status(400).send('Invalid subscription type parameter.')
    return
  }
  const optOutAllType: notification_preference = 'opt_out_all'
  const wantsToOptOutAll = notificationSubscriptionType === optOutAllType

  const user = await getPrivateUser(id)

  if (!user) {
    res.send('This user is not currently subscribed or does not exist.')
    return
  }

  const previousDestinations =
    user.notificationPreferences[notificationSubscriptionType]

  let newDestinations = previousDestinations
  if (wantsToOptOutAll) newDestinations.push('email')
  else
    newDestinations = previousDestinations.filter(
      (destination) => destination !== 'email'
    )

  console.log(previousDestinations)
  const { email } = user

  const update: Partial<PrivateUser> = {
    notificationPreferences: {
      ...user.notificationPreferences,
      [notificationSubscriptionType]: newDestinations,
    },
  }

  await trackPublicEvent(id, 'unsubscribe from emails', {
    type: notificationSubscriptionType,
  })

  const pg = createSupabaseDirectClient()
  await updatePrivateUser(pg, id, update)
  const unsubscribeEndpoint = getApiUrl('unsubscribe')

  const optOutAllUrl = `${unsubscribeEndpoint}?id=${id}&type=${optOutAllType}`
  if (wantsToOptOutAll) {
    res.send(
      `
     <!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml"
      xmlns:o="urn:schemas-microsoft-com:office:office">

<head>
  <title>Unsubscribe from Manifold emails</title>
  <!--[if !mso]><!-->
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <!--<![endif]-->
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style type="text/css">
      #outlook a {
          padding: 0;
      }

      body {
          margin: 0;
          padding: 0;
          -webkit-text-size-adjust: 100%;
          -ms-text-size-adjust: 100%;
      }

      table,
      td {
          border-collapse: collapse;
          mso-table-lspace: 0pt;
          mso-table-rspace: 0pt;
      }

      img {
          border: 0;
          height: auto;
          line-height: 100%;
          outline: none;
          text-decoration: none;
          -ms-interpolation-mode: bicubic;
      }

      p {
          display: block;
          margin: 13px 0;
      }
  </style>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <!--[if lte mso 11]>
  <style type="text/css">
    .mj-outlook-group-fix { width:100% !important; }
  </style>
  <![endif]-->
  <style type="text/css">
      @media only screen and (min-width:480px) {
          .mj-column-per-100 {
              width: 100% !important;
              max-width: 100%;
          }
      }
  </style>
  <style media="screen and (min-width:480px)">
      .moz-text-html .mj-column-per-100 {
          width: 100% !important;
          max-width: 100%;
      }
  </style>
  <style type="text/css">
      [owa] .mj-column-per-100 {
          width: 100% !important;
          max-width: 100%;
      }
  </style>
  <style type="text/css">
      @media only screen and (max-width:480px) {
          table.mj-full-width-mobile {
              width: 100% !important;
          }

          td.mj-full-width-mobile {
              width: auto !important;
          }
      }
  </style>
</head>
<body style="word-spacing:normal;background-color:#F4F4F4;">
<div style="background-color:#F4F4F4;">
  <!--[if mso | IE]><table align="center" border="0" cellpadding="0" cellspacing="0" class="" role="presentation" style="width:600px;" width="600" bgcolor="#ffffff" ><tr><td style="line-height:0px;font-size:0px;mso-line-height-rule:exactly;"><![endif]-->
  <div style="background:#ffffff;background-color:#ffffff;margin:0px auto;max-width:600px;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation"
           style="background:#ffffff;background-color:#ffffff;width:100%;">
      <tbody>
      <tr>
        <td
          style="direction:ltr;font-size:0px;padding:0px 0px 0px 0px;padding-bottom:0px;padding-left:0px;padding-right:0px;padding-top:0px;text-align:center;">
          <!--[if mso | IE]><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td class="" style="vertical-align:top;width:600px;" ><![endif]-->
          <div class="mj-column-per-100 mj-outlook-group-fix"
               style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;">
            <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;"
                   width="100%">
              <tbody>
              <tr>
                <td style="width:550px;">
                  <a href="https://manifold.markets" target="_blank">
                    <img alt="banner logo" height="auto" src="https://manifold.markets/logo-banner.png"
                         style="border:none;display:block;outline:none;text-decoration:none;height:auto;width:100%;font-size:13px;"
                         title="" width="550">
                  </a>
                </td>
              </tr>
              <tr>
                <td align="left"
                    style="font-size:0px;padding:10px 25px;padding-top:0px;padding-bottom:0px;word-break:break-word;">
                  <div
                    style="font-family:Arial, sans-serif;font-size:18px;letter-spacing:normal;line-height:1;text-align:left;color:#000000;">
                    <p class="text-build-content"
                       style="line-height: 24px; margin: 10px 0; margin-top: 10px; margin-bottom: 10px;"
                       data-testid="4XoHRGw1Y">
                       <span
                         style="color:#000000;font-family:Arial, Helvetica, sans-serif;font-size:18px;">
                      ${email} has opted out of receiving unnecessary email notifications
                    </span>

                  </div>

                </td>
              </tr>
              <tr>
                <td>
                  <p></p>
                </td>
              </tr>
              </tbody>
            </table>
          </div>
        </td>
      </tr>
      </tbody>
    </table>
  </div>
</div>
</body>
</html>`
    )
  } else {
    res.send(
      `
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml"
      xmlns:o="urn:schemas-microsoft-com:office:office">

<head>
  <title>Unsubscribe from Manifold emails</title>
    <!--[if !mso]><!-->
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <!--<![endif]-->
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style type="text/css">
        #outlook a {
            padding: 0;
        }

        body {
            margin: 0;
            padding: 0;
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
        }

        table,
        td {
            border-collapse: collapse;
            mso-table-lspace: 0pt;
            mso-table-rspace: 0pt;
        }

        img {
            border: 0;
            height: auto;
            line-height: 100%;
            outline: none;
            text-decoration: none;
            -ms-interpolation-mode: bicubic;
        }

        p {
            display: block;
            margin: 13px 0;
        }
    </style>
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:AllowPNG/>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
    <!--[if lte mso 11]>
    <style type="text/css">
        .mj-outlook-group-fix { width:100% !important; }
    </style>
    <![endif]-->
    <style type="text/css">
        @media only screen and (min-width:480px) {
            .mj-column-per-100 {
                width: 100% !important;
                max-width: 100%;
            }
        }
    </style>
    <style media="screen and (min-width:480px)">
        .moz-text-html .mj-column-per-100 {
            width: 100% !important;
            max-width: 100%;
        }
    </style>
    <style type="text/css">
        [owa] .mj-column-per-100 {
            width: 100% !important;
            max-width: 100%;
        }
    </style>
    <style type="text/css">
        @media only screen and (max-width:480px) {
            table.mj-full-width-mobile {
                width: 100% !important;
            }

            td.mj-full-width-mobile {
                width: auto !important;
            }
        }
    </style>
</head>
<body style="word-spacing:normal;background-color:#F4F4F4;">
<div style="background-color:#F4F4F4;">
    <!--[if mso | IE]><table align="center" border="0" cellpadding="0" cellspacing="0" class="" role="presentation" style="width:600px;" width="600" bgcolor="#ffffff" ><tr><td style="line-height:0px;font-size:0px;mso-line-height-rule:exactly;"><![endif]-->
    <div style="background:#ffffff;background-color:#ffffff;margin:0px auto;max-width:600px;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation"
               style="background:#ffffff;background-color:#ffffff;width:100%;">
            <tbody>
            <tr>
                <td
                  style="direction:ltr;font-size:0px;padding:0px 0px 0px 0px;padding-bottom:0px;padding-left:0px;padding-right:0px;padding-top:0px;text-align:center;">
                    <!--[if mso | IE]><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td class="" style="vertical-align:top;width:600px;" ><![endif]-->
                    <div class="mj-column-per-100 mj-outlook-group-fix"
                         style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;">
                        <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;"
                               width="100%">
                            <tbody>
                            <tr>
                                <td style="width:550px;">
                                    <a href="https://manifold.markets" target="_blank">
                                        <img alt="banner logo" height="auto" src="https://manifold.markets/logo-banner.png"
                                             style="border:none;display:block;outline:none;text-decoration:none;height:auto;width:100%;font-size:13px;"
                                             title="" width="550">
                                    </a>
                                </td>
                            </tr>
                            <tr>
                                <td align="left"
                                    style="font-size:0px;padding:10px 25px;padding-top:0px;padding-bottom:0px;word-break:break-word;">
                                    <div
                                      style="font-family:Arial, sans-serif;font-size:18px;letter-spacing:normal;line-height:1;text-align:left;color:#000000;">
                                        <p class="text-build-content"
                                           style="line-height: 24px; margin: 10px 0; margin-top: 10px; margin-bottom: 10px;"
                                           data-testid="4XoHRGw1Y"><span
                                          style="color:#000000;font-family:Arial, Helvetica, sans-serif;font-size:18px;">
                              Hello!</span></p>
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <td align="left"
                                    style="font-size:0px;padding:10px 25px;padding-top:0px;padding-bottom:0px;word-break:break-word;">
                                    <div
                                      style="font-family:Arial, sans-serif;font-size:18px;letter-spacing:normal;line-height:1;text-align:left;color:#000000;">
                                        <p class="text-build-content"
                                           style="line-height: 24px; margin: 10px 0; margin-top: 10px; margin-bottom: 10px;"
                                           data-testid="4XoHRGw1Y">
                       <span
                         style="color:#000000;font-family:Arial, Helvetica, sans-serif;font-size:18px;">
                      ${email} has been unsubscribed from email notifications related to:
                    </span>
                                            <br/>
                                            <br/>

                                            <span style="font-weight: bold; color:#000000;font-family:Arial, Helvetica, sans-serif;font-size:18px;">${NOTIFICATION_DESCRIPTIONS[notificationSubscriptionType].detailed}.</span>
                                        </p>
                                        <br/>
                                        <br/>
                                        <br/>
                    <span>Click
                    <a href=${optOutAllUrl}>here</a>
                       to unsubscribe from all emails.
                      </span>
                                        <br/>
                                        <br/>
                    <span>Click
                    <a href='https://manifold.markets/notifications?tab=settings'>here</a>
                       to manage the rest of your notification settings.
                      </span>
                                    </div>

                                </td>
                            </tr>
                            <tr>
                                <td>
                                    <p></p>
                                </td>
                            </tr>
                            </tbody>
                        </table>
                    </div>
                </td>
            </tr>
            </tbody>
        </table>
    </div>
</div>
</body>
</html>
`
    )
  }
}
