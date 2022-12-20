# training-nft-4

Training n°4 for NFT marketplace

![https://france-vins.eu/wp-content/uploads/2018/10/les-meilleures-caves-%C3%A0-vin-image.jpg](https://france-vins.eu/wp-content/uploads/2018/10/les-meilleures-caves-%C3%A0-vin-image.jpg)

We finish by using multi asset template.

- you have unlimited NFT collections
- you have unlimited quantity of items in each collection

To resume, you are producting any quantity of wine bottles on n collections

# :arrow_forward: Go forward

Keep your code from previous training or get the solution [here](https://github.com/marigold-dev/training-nft-3/tree/main/solution)

> If you clone/fork a repo, rebuild in local

```bash
npm i
cd ./app
yarn install
cd ..
```

# :scroll: Smart contract

## Do breaking changes on nft template to fit with the new library

Point to the new template changing the first import line to

```jsligo
#import "@ligo/fa/lib/fa2/asset/multi_asset.jsligo" "MULTIASSET"
```

It means you will change the namespace from `SINGLEASSET` to `MULTIASSET` everywhere (like this you are sure to use the correct library)

You will introduce the token_id back as there a several collections now.
We can remove `totalSupply` and add two extra key sets `owner_token_ids` and `token_ids`

Change the storage definition

```jsligo
type offer = {
  quantity : nat,
  price : nat
};

type storage =
  {
    administrators: set<address>,
    offers: map<[address,nat],offer>,  //user sells an offer for a token_id
    ledger: MULTIASSET.Ledger.t,
    metadata: MULTIASSET.Metadata.t,
    token_metadata: MULTIASSET.TokenMetadata.t,
    operators: MULTIASSET.Operators.t,
    owner_token_ids : set<[MULTIASSET.Storage.owner,MULTIASSET.Storage.token_id]>,
    token_ids : set<MULTIASSET.Storage.token_id>
  };
```

Update `parameter` type too

```jsligo
type parameter =
  | ["Mint", nat,nat,bytes,bytes,bytes,bytes] //token_id, quantity, name , description ,version ,symbol , bytesipfsUrl
  | ["AddAdministrator" , address]
  | ["Buy", nat,nat, address]  //buy token_id,quantity at a seller offer price
  | ["Sell", nat,nat, nat]  //sell token_id,quantity at a price
  | ["Transfer", MULTIASSET.transfer]
  | ["Balance_of", MULTIASSET.balance_of]
  | ["Update_operators", MULTIASSET.update_operators];
```

Update `mint` function

```jsligo
const mint = (token_id : nat, quantity: nat, name : bytes, description : bytes,symbol : bytes, ipfsUrl: bytes, s: storage) : ret => {

   if(quantity <= (0 as nat)) return failwith("0");

   if(! Set.mem(Tezos.get_sender(), s.administrators)) return failwith("1");

   const token_info: map<string, bytes> =
     Map.literal(list([
      ["name", name],
      ["description",description],
      ["interfaces", (bytes `["TZIP-12"]`)],
      ["thumbnailUri", ipfsUrl],
      ["symbol",symbol],
      ["decimals", (bytes `0`)]
     ])) as map<string, bytes>;


    const metadata : bytes = bytes
  `{
      "name":"FA2 NFT Marketplace",
      "description":"Example of FA2 implementation",
      "version":"0.0.1",
      "license":{"name":"MIT"},
      "authors":["Marigold<contact@marigold.dev>"],
      "homepage":"https://marigold.dev",
      "source":{
        "tools":["Ligo"],
        "location":"https://github.com/ligolang/contract-catalogue/tree/main/lib/fa2"},
      "interfaces":["TZIP-012"],
      "errors": [],
      "views": []
      }` ;

    return [list([]) as list<operation>,
          {...s,
     ledger: Big_map.add([Tezos.get_sender(),token_id],quantity as nat,s.ledger) as MULTIASSET.Ledger.t,
     metadata : Big_map.literal(list([["",  bytes `tezos-storage:data`],["data", metadata]])),
     token_metadata: Big_map.add(token_id, {token_id: token_id,token_info:token_info},s.token_metadata),
     operators: Big_map.empty as MULTIASSET.Operators.t,
     owner_token_ids : Set.add([Tezos.get_sender(),token_id],s.owner_token_ids),
     token_ids: Set.add(token_id, s.token_ids)}]};
```

`sell` function

```jsligo
const sell = (token_id : nat, quantity: nat, price: nat, s: storage) : ret => {

  //check balance of seller
  const sellerBalance = MULTIASSET.Ledger.get_for_user(s.ledger,Tezos.get_source(),token_id);
  if(quantity > sellerBalance) return failwith("2");

  //need to allow the contract itself to be an operator on behalf of the seller
  const newOperators = MULTIASSET.Operators.add_operator(s.operators,Tezos.get_source(),Tezos.get_self_address(),token_id);

  //DECISION CHOICE: if offer already exists, we just override it
  return [list([]) as list<operation>,{...s,offers:Map.add([Tezos.get_source(),token_id],{quantity : quantity, price : price},s.offers),operators:newOperators}];
};
```

`buy`function

```jsligo
const buy = (token_id : nat, quantity: nat, seller: address, s: storage) : ret => {

  //search for the offer
  return match( Map.find_opt([seller,token_id],s.offers) , {
    None : () => failwith("3"),
    Some : (offer : offer) => {

      //check if amount have been paid enough
      if(Tezos.get_amount() < offer.price  * (1 as mutez)) return failwith("5");

      // prepare transfer of XTZ to seller
      const op = Tezos.transaction(unit,offer.price  * (1 as mutez),Tezos.get_contract_with_error(seller,"6"));

      //transfer tokens from seller to buyer
      let ledger = MULTIASSET.Ledger.decrease_token_amount_for_user(s.ledger,seller,token_id,quantity);
      ledger = MULTIASSET.Ledger.increase_token_amount_for_user(ledger,Tezos.get_source(),token_id,quantity);

      //update new offer
      const newOffer = {...offer,quantity : abs(offer.quantity - quantity)};

      return [list([op]) as list<operation>, {...s, offers : Map.update([seller,token_id],Some(newOffer),s.offers), ledger : ledger, owner_token_ids : Set.add([Tezos.get_source(),token_id],s.owner_token_ids) }];
    }
  });
};
```

and finally the `main`

```jsligo
const main = ([p, s]: [parameter,storage]): ret =>
    match(p, {
     Mint: (p: [nat,nat,bytes, bytes, bytes, bytes,bytes]) => mint(p[0],p[1],p[2],p[3],p[4],p[5], s),
     AddAdministrator : (p : address) => {if(Set.mem(Tezos.get_sender(), s.administrators)){ return [list([]),{...s,administrators:Set.add(p, s.administrators)}]} else {return failwith("1");}} ,
     Buy: (p : [nat,nat,address]) => buy(p[0],p[1],p[2],s),
     Sell: (p : [nat,nat,nat]) => sell(p[0],p[1],p[2],s),
     Transfer: (p: MULTIASSET.transfer) => {
      const ret2 : [list<operation>, MULTIASSET.storage] = MULTIASSET.transfer(p,{ledger:s.ledger,metadata:s.metadata,token_metadata:s.token_metadata,operators:s.operators,owner_token_ids:s.owner_token_ids,token_ids:s.token_ids});
      return [ret2[0],{...s,ledger:ret2[1].ledger,metadata:ret2[1].metadata,token_metadata:ret2[1].token_metadata,operators:ret2[1].operators,owner_token_ids:ret2[1].owner_token_ids,token_ids:ret2[1].token_ids}];
     },
     Balance_of: (p: MULTIASSET.balance_of) => {
      const ret2 : [list<operation>, MULTIASSET.storage] = MULTIASSET.balance_of(p,{ledger:s.ledger,metadata:s.metadata,token_metadata:s.token_metadata,operators:s.operators,owner_token_ids:s.owner_token_ids,token_ids:s.token_ids});
      return [ret2[0],{...s,ledger:ret2[1].ledger,metadata:ret2[1].metadata,token_metadata:ret2[1].token_metadata,operators:ret2[1].operators,owner_token_ids:ret2[1].owner_token_ids,token_ids:ret2[1].token_ids}];
      },
     Update_operators: (p: MULTIASSET.update_operator) => {
      const ret2 : [list<operation>, MULTIASSET.storage] = MULTIASSET.update_ops(p,{ledger:s.ledger,metadata:s.metadata,token_metadata:s.token_metadata,operators:s.operators,owner_token_ids:s.owner_token_ids,token_ids:s.token_ids});
      return [ret2[0],{...s,ledger:ret2[1].ledger,metadata:ret2[1].metadata,token_metadata:ret2[1].token_metadata,operators:ret2[1].operators,owner_token_ids:ret2[1].owner_token_ids,token_ids:ret2[1].token_ids}];
      }
     });
```

Change the initial storage to

```jsligo
#include "nft.jsligo"
const default_storage =
{
    administrators: Set.literal(list(["tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb" as address])) as set<address>,
    offers: Map.empty as map<[address,nat],offer>,
    ledger: Big_map.empty as MULTIASSET.Ledger.t,
    metadata: Big_map.empty as MULTIASSET.Metadata.t,
    token_metadata: Big_map.empty as MULTIASSET.TokenMetadata.t,
    operators: Big_map.empty as MULTIASSET.Operators.t,
    owner_token_ids : Set.empty as set<[MULTIASSET.Storage.owner,MULTIASSET.Storage.token_id]>,
    token_ids : Set.empty as set<MULTIASSET.Storage.token_id>
  }
;
```

Compile again and deploy to ghostnet

```bash
TAQ_LIGO_IMAGE=ligolang/ligo:0.57.0 taq compile nft.jsligo
taq deploy nft.tz -e "testing"
```

```logs
┌──────────┬──────────────────────────────────────┬───────┬──────────────────┬────────────────────────────────┐
│ Contract │ Address                              │ Alias │ Balance In Mutez │ Destination                    │
├──────────┼──────────────────────────────────────┼───────┼──────────────────┼────────────────────────────────┤
│ nft.tz   │ KT1ExUVXDmRSk42vJDi37fQdKCDEPS9m2DoB │ nft   │ 0                │ https://ghostnet.ecadinfra.com │
└──────────┴──────────────────────────────────────┴───────┴──────────────────┴────────────────────────────────┘
```

:tada: Hooray ! We have finished the backend :tada:

# :performing_arts: NFT Marketplace front

Generate Typescript classes and go to the frontend to run the server

```bash
taq generate types ./app/src
cd ./app
yarn install
yarn run start
```

## Update in `App.tsx`

We forget about token_id == 0 and we fetch back all tokens.
Replace the function `refreshUserContextOnPageReload` by

```typescript
const refreshUserContextOnPageReload = async () => {
  console.log("refreshUserContext");
  //CONTRACT
  try {
    let c = await Tezos.contract.at(nftContractAddress, tzip12);
    console.log("nftContractAddress", nftContractAddress);

    let nftContrat: NftWalletType = await Tezos.wallet.at<NftWalletType>(
      nftContractAddress
    );
    const storage = (await nftContrat.storage()) as Storage;
    await Promise.all(
      storage.token_ids.map(async (token_id: nat) => {
        let tokenMetadata: TZIP21TokenMetadata = (await c
          .tzip12()
          .getTokenMetadata(token_id.toNumber())) as TZIP21TokenMetadata;
        nftContratTokenMetadataMap.set(token_id.toNumber(), tokenMetadata);
      })
    );
    setNftContratTokenMetadataMap(new Map(nftContratTokenMetadataMap)); //new Map to force refresh
    setNftContrat(nftContrat);
    setStorage(storage);
  } catch (error) {
    console.log("error refreshing nft contract: ", error);
  }

  //USER
  const activeAccount = await wallet.client.getActiveAccount();
  if (activeAccount) {
    setUserAddress(activeAccount.address);
    const balance = await Tezos.tz.getBalance(activeAccount.address);
    setUserBalance(balance.toNumber());
  }

  console.log("refreshUserContext ended.");
};
```

Don't forget the import

```typescript
import { nat } from "./type-aliases";
```

## Update in `MintPage.tsx`

Just update the `mint` call adding the missing quantity, and add back the token_id counter incrementer

```typescript
import {
  AddCircleOutlined,
  Close,
  KeyboardArrowLeft,
  KeyboardArrowRight,
} from "@mui/icons-material";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import {
  Box,
  Button,
  CardHeader,
  CardMedia,
  MobileStepper,
  Stack,
  SwipeableDrawer,
  TextField,
  Toolbar,
  useMediaQuery,
} from "@mui/material";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { char2Bytes } from "@taquito/utils";
import { BigNumber } from "bignumber.js";
import { useFormik } from "formik";
import { useSnackbar } from "notistack";
import React, { Fragment, useEffect, useState } from "react";
import SwipeableViews from "react-swipeable-views";
import * as yup from "yup";
import { TZIP21TokenMetadata, UserContext, UserContextType } from "./App";
import { TransactionInvalidBeaconError } from "./TransactionInvalidBeaconError";
import { address, bytes, nat } from "./type-aliases";

export default function MintPage() {
  const {
    userAddress,
    nftContrat,
    refreshUserContextOnPageReload,
    nftContratTokenMetadataMap,
    storage,
  } = React.useContext(UserContext) as UserContextType;
  const { enqueueSnackbar } = useSnackbar();
  const [pictureUrl, setPictureUrl] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);

  const [activeStep, setActiveStep] = React.useState(0);

  const handleNext = () => {
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleStepChange = (step: number) => {
    setActiveStep(step);
  };

  const validationSchema = yup.object({
    name: yup.string().required("Name is required"),
    description: yup.string().required("Description is required"),
    symbol: yup.string().required("Symbol is required"),
    quantity: yup
      .number()
      .required("Quantity is required")
      .positive("ERROR: The number must be greater than 0!"),
  });

  const formik = useFormik({
    initialValues: {
      name: "",
      description: "",
      token_id: 0,
      symbol: "WINE",
      quantity: 1,
    } as TZIP21TokenMetadata & { quantity: number },
    validationSchema: validationSchema,
    onSubmit: (values) => {
      mint(values);
    },
  });

  //open mint drawer if admin
  useEffect(() => {
    if (storage!.administrators.indexOf(userAddress! as address) < 0)
      setFormOpen(false);
    else setFormOpen(true);
  }, [userAddress]);

  useEffect(() => {
    (async () => {
      if (storage && storage.token_ids.length > 0) {
        formik.setFieldValue("token_id", storage?.token_ids.length);
      }
    })();
  }, [storage?.token_ids]);

  const mint = async (
    newTokenDefinition: TZIP21TokenMetadata & { quantity: number }
  ) => {
    try {
      //IPFS
      if (file) {
        const formData = new FormData();
        formData.append("file", file);

        const requestHeaders: HeadersInit = new Headers();
        requestHeaders.set(
          "pinata_api_key",
          `${process.env.REACT_APP_PINATA_API_KEY}`
        );
        requestHeaders.set(
          "pinata_secret_api_key",
          `${process.env.REACT_APP_PINATA_API_SECRET}`
        );

        const resFile = await fetch(
          "https://api.pinata.cloud/pinning/pinFileToIPFS",
          {
            method: "post",
            body: formData,
            headers: requestHeaders,
          }
        );

        const responseJson = await resFile.json();
        console.log("responseJson", responseJson);

        const thumbnailUri = `ipfs://${responseJson.IpfsHash}`;
        setPictureUrl(
          `https://gateway.pinata.cloud/ipfs/${responseJson.IpfsHash}`
        );

        const op = await nftContrat!.methods
          .mint(
            new BigNumber(newTokenDefinition.token_id) as nat,
            new BigNumber(newTokenDefinition.quantity) as nat,
            char2Bytes(newTokenDefinition.name!) as bytes,
            char2Bytes(newTokenDefinition.description!) as bytes,
            char2Bytes(newTokenDefinition.symbol!) as bytes,
            char2Bytes(thumbnailUri) as bytes
          )
          .send();

        //close directly the form
        setFormOpen(false);
        enqueueSnackbar(
          "Wine collection is minting ... it will be ready on next block, wait for the confirmation message before minting another collection",
          { variant: "info" }
        );

        await op.confirmation(2);

        enqueueSnackbar("Wine collection minted", { variant: "success" });

        refreshUserContextOnPageReload(); //force all app to refresh the context
      }
    } catch (error) {
      console.table(`Error: ${JSON.stringify(error, null, 2)}`);
      let tibe: TransactionInvalidBeaconError =
        new TransactionInvalidBeaconError(error);
      enqueueSnackbar(tibe.data_message, {
        variant: "error",
        autoHideDuration: 10000,
      });
    }
  };

  const [formOpen, setFormOpen] = useState<boolean>(false);

  const toggleDrawer =
    (open: boolean) => (event: React.KeyboardEvent | React.MouseEvent) => {
      if (
        event.type === "keydown" &&
        ((event as React.KeyboardEvent).key === "Tab" ||
          (event as React.KeyboardEvent).key === "Shift")
      ) {
        return;
      }
      setFormOpen(open);
    };

  const isTablet = useMediaQuery("(min-width:600px)");

  return (
    <Paper>
      <Button
        disabled={storage!.administrators.indexOf(userAddress! as address) < 0}
        sx={{
          position: "absolute",
          right: "-9em",
          maringBottom: "40px",
          top: "50vh",
          transform: "rotate(270deg)",
          zIndex: "10000",
          display: formOpen ? "none" : "block",
        }}
        onClick={toggleDrawer(!formOpen)}
      >
        <UnfoldMoreIcon />
        {" Mint Form " +
          (storage!.administrators.indexOf(userAddress! as address) < 0
            ? " (You are not admin)"
            : "")}
        <UnfoldMoreIcon />
      </Button>

      <SwipeableDrawer
        onClose={toggleDrawer(false)}
        onOpen={toggleDrawer(true)}
        anchor="right"
        open={formOpen}
        variant="temporary"
      >
        <Toolbar
          sx={
            isTablet
              ? { marginTop: "0", marginRight: "0" }
              : { marginTop: "35px", marginRight: "125px" }
          }
        />
        <Box
          sx={{
            width: isTablet ? "40vw" : "60vw",
            borderColor: "text.secondary",
            borderStyle: "solid",
            borderWidth: "1px",

            height: "calc(100vh - 64px)",
          }}
        >
          <Button
            sx={{
              position: "absolute",
              right: "0",
              display: !formOpen ? "none" : "block",
            }}
            onClick={toggleDrawer(!formOpen)}
          >
            <Close />
          </Button>
          <form onSubmit={formik.handleSubmit}>
            <Stack spacing={2} margin={2} alignContent={"center"}>
              <Typography variant="h5">Mint a new collection</Typography>

              <TextField
                id="standard-basic"
                name="token_id"
                label="token_id"
                value={formik.values.token_id}
                disabled
                variant="filled"
              />
              <TextField
                id="standard-basic"
                name="name"
                label="name"
                required
                value={formik.values.name}
                onChange={formik.handleChange}
                error={formik.touched.name && Boolean(formik.errors.name)}
                helperText={formik.touched.name && formik.errors.name}
                variant="filled"
              />
              <TextField
                id="standard-basic"
                name="symbol"
                label="symbol"
                required
                value={formik.values.symbol}
                onChange={formik.handleChange}
                error={formik.touched.symbol && Boolean(formik.errors.symbol)}
                helperText={formik.touched.symbol && formik.errors.symbol}
                variant="filled"
              />
              <TextField
                id="standard-basic"
                name="description"
                label="description"
                required
                multiline
                minRows={2}
                value={formik.values.description}
                onChange={formik.handleChange}
                error={
                  formik.touched.description &&
                  Boolean(formik.errors.description)
                }
                helperText={
                  formik.touched.description && formik.errors.description
                }
                variant="filled"
              />

              <TextField
                type="number"
                id="standard-basic"
                name="quantity"
                label="quantity"
                required
                value={formik.values.quantity}
                onChange={formik.handleChange}
                error={
                  formik.touched.quantity && Boolean(formik.errors.quantity)
                }
                helperText={formik.touched.quantity && formik.errors.quantity}
                variant="filled"
              />

              {pictureUrl ? (
                <img height={100} width={100} src={pictureUrl} />
              ) : (
                ""
              )}
              <Button variant="contained" component="label" color="primary">
                <AddCircleOutlined />
                Upload an image
                <input
                  type="file"
                  hidden
                  name="data"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const data = e.target.files ? e.target.files[0] : null;
                    if (data) {
                      setFile(data);
                    }
                    e.preventDefault();
                  }}
                />
              </Button>

              <Button variant="contained" type="submit">
                Mint
              </Button>
            </Stack>
          </form>
        </Box>
      </SwipeableDrawer>

      <Typography variant="h5">Mint your wine collection</Typography>

      {nftContratTokenMetadataMap.size != 0 ? (
        <Box sx={{ width: "70vw" }}>
          <SwipeableViews
            axis="x"
            index={activeStep}
            onChangeIndex={handleStepChange}
            enableMouseEvents
          >
            {Array.from(nftContratTokenMetadataMap!.entries()).map(
              ([token_id, token]) => (
                <Card
                  sx={{
                    display: "block",
                    maxWidth: "80vw",
                    overflow: "hidden",
                  }}
                  key={token_id.toString()}
                >
                  <CardHeader
                    titleTypographyProps={
                      isTablet ? { fontSize: "1.5em" } : { fontSize: "1em" }
                    }
                    title={token.name}
                  />

                  <CardMedia
                    sx={
                      isTablet
                        ? {
                            width: "auto",
                            marginLeft: "33%",
                            maxHeight: "50vh",
                          }
                        : { width: "100%", maxHeight: "40vh" }
                    }
                    component="img"
                    image={token.thumbnailUri?.replace(
                      "ipfs://",
                      "https://gateway.pinata.cloud/ipfs/"
                    )}
                  />

                  <CardContent>
                    <Box>
                      <Typography>{"ID : " + token_id}</Typography>
                      <Typography>{"Symbol : " + token.symbol}</Typography>
                      <Typography>
                        {"Description : " + token.description}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              )
            )}
          </SwipeableViews>
          <MobileStepper
            variant="text"
            steps={Array.from(nftContratTokenMetadataMap!.entries()).length}
            position="static"
            activeStep={activeStep}
            nextButton={
              <Button
                size="small"
                onClick={handleNext}
                disabled={
                  activeStep ===
                  Array.from(nftContratTokenMetadataMap!.entries()).length - 1
                }
              >
                Next
                <KeyboardArrowRight />
              </Button>
            }
            backButton={
              <Button
                size="small"
                onClick={handleBack}
                disabled={activeStep === 0}
              >
                <KeyboardArrowLeft />
                Back
              </Button>
            }
          />
        </Box>
      ) : (
        <Fragment />
      )}
    </Paper>
  );
}
```

## Update in `OffersPage.tsx`

Copy the whole content here

```typescript
import SellIcon from "@mui/icons-material/Sell";
import {
  Avatar,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  TextField,
} from "@mui/material";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import BigNumber from "bignumber.js";
import { useFormik } from "formik";
import { useSnackbar } from "notistack";
import React, { Fragment, useEffect } from "react";
import * as yup from "yup";
import { UserContext, UserContextType } from "./App";
import { TransactionInvalidBeaconError } from "./TransactionInvalidBeaconError";
import { address, nat } from "./type-aliases";

const validationSchema = yup.object({
  price: yup
    .number()
    .required("Price is required")
    .positive("ERROR: The number must be greater than 0!"),
  quantity: yup
    .number()
    .required("Quantity is required")
    .positive("ERROR: The number must be greater than 0!"),
});

type Offer = {
  price: nat;
  quantity: nat;
};

export default function OffersPage() {
  const [selectedTokenId, setSelectedTokenId] = React.useState<number>(0);

  let [offersTokenIDMap, setOffersTokenIDMap] = React.useState<Map<nat, Offer>>(
    new Map()
  );
  let [ledgerTokenIDMap, setLedgerTokenIDMap] = React.useState<Map<nat, nat>>(
    new Map()
  );

  const {
    nftContrat,
    nftContratTokenMetadataMap,
    userAddress,
    storage,
    refreshUserContextOnPageReload,
  } = React.useContext(UserContext) as UserContextType;

  const { enqueueSnackbar } = useSnackbar();

  const formik = useFormik({
    initialValues: {
      price: 0,
      quantity: 1,
    },
    validationSchema: validationSchema,
    onSubmit: (values) => {
      console.log("onSubmit: (values)", values, selectedTokenId);
      sell(selectedTokenId, values.quantity, values.price);
    },
  });

  const initPage = async () => {
    if (storage) {
      console.log("context is not empty, init page now");
      ledgerTokenIDMap = new Map();
      offersTokenIDMap = new Map();

      await Promise.all(
        storage.owner_token_ids.map(async (element) => {
          if (element[0] === userAddress) {
            const ownerBalance = await storage.ledger.get({
              0: userAddress as address,
              1: element[1],
            });
            if (ownerBalance != BigNumber(0))
              ledgerTokenIDMap.set(element[1], ownerBalance);
            const ownerOffers = await storage.offers.get({
              0: userAddress as address,
              1: element[1],
            });
            if (ownerOffers && ownerOffers.quantity != BigNumber(0))
              offersTokenIDMap.set(element[1], ownerOffers);

            console.log(
              "found for " +
                element[0] +
                " on token_id " +
                element[1] +
                " with balance " +
                ownerBalance
            );
          } else {
            console.log("skip to next owner");
          }
        })
      );
      setLedgerTokenIDMap(new Map(ledgerTokenIDMap)); //force refresh
      setOffersTokenIDMap(new Map(offersTokenIDMap)); //force refresh

      console.log("ledgerTokenIDMap", ledgerTokenIDMap);
    } else {
      console.log("context is empty, wait for parent and retry ...");
    }
  };

  useEffect(() => {
    (async () => {
      console.log("after a storage changed");
      await initPage();
    })();
  }, [storage]);

  useEffect(() => {
    (async () => {
      console.log("on Page init");
      await initPage();
    })();
  }, []);

  const sell = async (token_id: number, quantity: number, price: number) => {
    try {
      const op = await nftContrat?.methods
        .sell(
          BigNumber(token_id) as nat,
          BigNumber(quantity) as nat,
          BigNumber(price * 1000000) as nat //to mutez
        )
        .send();

      await op?.confirmation(2);

      enqueueSnackbar(
        "Wine collection (token_id=" +
          token_id +
          ") offer for " +
          quantity +
          " units at price of " +
          price +
          " XTZ",
        { variant: "success" }
      );

      refreshUserContextOnPageReload(); //force all app to refresh the context
    } catch (error) {
      console.table(`Error: ${JSON.stringify(error, null, 2)}`);
      let tibe: TransactionInvalidBeaconError =
        new TransactionInvalidBeaconError(error);
      enqueueSnackbar(tibe.data_message, {
        variant: "error",
        autoHideDuration: 10000,
      });
    }
  };

  return (
    <Box
      component="main"
      sx={{
        flex: 1,
        py: 6,
        px: 4,
        bgcolor: "#eaeff1",
        backgroundImage:
          "url(https://en.vinex.market/skin/default/images/banners/home/new/banner-1180.jpg)",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }}
    >
      <Paper sx={{ maxWidth: 936, margin: "auto", overflow: "hidden" }}>
        {ledgerTokenIDMap && ledgerTokenIDMap.size != 0 ? (
          Array.from(ledgerTokenIDMap.entries()).map(([token_id, balance]) => (
            <Card key={userAddress + "-" + token_id.toString()}>
              <CardHeader
                avatar={
                  <Avatar sx={{ bgcolor: "purple" }} aria-label="recipe">
                    {token_id.toString()}
                  </Avatar>
                }
                title={
                  nftContratTokenMetadataMap.get(token_id.toNumber())?.name
                }
              />

              <CardContent>
                <div>{"Owned : " + balance.toNumber()}</div>
                {offersTokenIDMap.get(token_id) ? (
                  <div>
                    {"Offer : " +
                      offersTokenIDMap.get(token_id)?.quantity +
                      " at price " +
                      offersTokenIDMap.get(token_id)?.price.dividedBy(1000000) +
                      " XTZ/bottle"}
                  </div>
                ) : (
                  ""
                )}
              </CardContent>

              <CardActions disableSpacing>
                <form
                  onSubmit={(values) => {
                    setSelectedTokenId(token_id.toNumber());
                    formik.handleSubmit(values);
                  }}
                >
                  <TextField
                    name="quantity"
                    label="quantity"
                    placeholder="Enter a quantity"
                    variant="standard"
                    type="number"
                    value={formik.values.quantity}
                    onChange={formik.handleChange}
                    error={
                      formik.touched.quantity && Boolean(formik.errors.quantity)
                    }
                    helperText={
                      formik.touched.quantity && formik.errors.quantity
                    }
                  />
                  <TextField
                    name="price"
                    label="price/bottle (XTZ)"
                    placeholder="Enter a price"
                    variant="standard"
                    type="number"
                    value={formik.values.price}
                    onChange={formik.handleChange}
                    error={formik.touched.price && Boolean(formik.errors.price)}
                    helperText={formik.touched.price && formik.errors.price}
                  />
                  <Button type="submit" aria-label="add to favorites">
                    <SellIcon /> SELL
                  </Button>
                </form>
              </CardActions>
            </Card>
          ))
        ) : (
          <Fragment />
        )}
      </Paper>
    </Box>
  );
}
```

## Update in `WineCataloguePage.tsx`

Copy the whole content here

```typescript
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import {
  Avatar,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  TextField,
} from "@mui/material";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import BigNumber from "bignumber.js";
import { useFormik } from "formik";
import { useSnackbar } from "notistack";
import React, { Fragment } from "react";
import * as yup from "yup";
import { UserContext, UserContextType } from "./App";
import { TransactionInvalidBeaconError } from "./TransactionInvalidBeaconError";
import { address, nat } from "./type-aliases";

type OfferEntry = [{ 0: address; 1: nat }, Offer];

type Offer = {
  price: nat;
  quantity: nat;
};

const validationSchema = yup.object({
  quantity: yup
    .number()
    .required("Quantity is required")
    .positive("ERROR: The number must be greater than 0!"),
});

export default function WineCataloguePage() {
  const {
    nftContrat,
    nftContratTokenMetadataMap,
    refreshUserContextOnPageReload,
    storage,
  } = React.useContext(UserContext) as UserContextType;
  const [selectedOfferEntry, setSelectedOfferEntry] =
    React.useState<OfferEntry | null>(null);

  const formik = useFormik({
    initialValues: {
      quantity: 1,
    },
    validationSchema: validationSchema,
    onSubmit: (values) => {
      console.log("onSubmit: (values)", values, selectedOfferEntry);
      buy(values.quantity, selectedOfferEntry!);
    },
  });
  const { enqueueSnackbar } = useSnackbar();

  const buy = async (quantity: number, selectedOfferEntry: OfferEntry) => {
    try {
      const op = await nftContrat?.methods
        .buy(
          selectedOfferEntry[0][1],
          BigNumber(quantity) as nat,
          selectedOfferEntry[0][0]
        )
        .send({
          amount: quantity * selectedOfferEntry[1].price.toNumber(),
          mutez: true,
        });

      await op?.confirmation(2);

      enqueueSnackbar(
        "Bought " +
          quantity +
          " unit of Wine collection (token_id:" +
          selectedOfferEntry[0][1] +
          ")",
        {
          variant: "success",
        }
      );

      refreshUserContextOnPageReload(); //force all app to refresh the context
    } catch (error) {
      console.table(`Error: ${JSON.stringify(error, null, 2)}`);
      let tibe: TransactionInvalidBeaconError =
        new TransactionInvalidBeaconError(error);
      enqueueSnackbar(tibe.data_message, {
        variant: "error",
        autoHideDuration: 10000,
      });
    }
  };

  return (
    <Box
      component="main"
      sx={{
        flex: 1,
        py: 6,
        px: 4,
        bgcolor: "#eaeff1",
        backgroundImage:
          "url(https://en.vinex.market/skin/default/images/banners/home/new/banner-1180.jpg)",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }}
    >
      <Paper sx={{ maxWidth: 936, margin: "auto", overflow: "hidden" }}>
        {storage?.offers && storage?.offers.size != 0 ? (
          Array.from(storage?.offers.entries())
            .filter(([key, offer]) => offer.quantity.isGreaterThan(0))
            .map(([key, offer]) => (
              <Card key={key[0] + "-" + key[1].toString()}>
                <CardHeader
                  avatar={
                    <Avatar sx={{ bgcolor: "purple" }} aria-label="recipe">
                      {key[1].toString()}
                    </Avatar>
                  }
                  title={
                    nftContratTokenMetadataMap.get(key[1].toNumber())?.name
                  }
                  subheader={"seller : " + key[0]}
                />

                <CardContent>
                  <div>
                    {"Offer : " +
                      offer.quantity +
                      " at price " +
                      offer.price.dividedBy(1000000) +
                      " XTZ/bottle"}
                  </div>
                </CardContent>

                <CardActions disableSpacing>
                  <form
                    onSubmit={(values) => {
                      setSelectedOfferEntry([key, offer]);
                      formik.handleSubmit(values);
                    }}
                  >
                    <TextField
                      name="quantity"
                      label="quantity"
                      placeholder="Enter a quantity"
                      variant="standard"
                      type="number"
                      value={formik.values.quantity}
                      onChange={formik.handleChange}
                      error={
                        formik.touched.quantity &&
                        Boolean(formik.errors.quantity)
                      }
                      helperText={
                        formik.touched.quantity && formik.errors.quantity
                      }
                    />
                    <Button type="submit" aria-label="add to favorites">
                      <ShoppingCartIcon /> BUY
                    </Button>
                  </form>
                </CardActions>
              </Card>
            ))
        ) : (
          <Fragment />
        )}
      </Paper>
    </Box>
  );
}
```

## Let's play

1. Connect with your wallet an choose `alice` account (or one of the administrators you set on the smart contract earlier). You are redirected to the Administration /mint page as there is no nft minted yet
2. Enter these values on the form for example :

- name : Saint Emilion - Franc la Rose
- symbol : SEMIL
- description : Grand cru 2007
- quantity : 1000

3. Click on `Upload an image` an select a bottle picture on your computer
4. Click on Mint button

Your picture will be pushed to IPFS and will display, then you are asked to sign the mint operation

- Confirm operation
- Wait less than 1 minutes until you get the confirmation notification, the page will refresh automatically

Now you can see the `Trading` menu and the `Bottle offers` sub menu

Click on the sub-menu entry

You are owner of this bottle so you can make an offer on it

- Enter a quantity
- Enter a price offer
- Click on `SELL` button
- Wait a bit for the confirmation, then it refreshes and you have an offer attached to your NFT

For buying,

- Disconnect from your user and connect with another account (who has enough XTZ to buy at least 1 bottle)
- The logged buyer can see that alice is selling some bottles from the unique collection
- Buy some bottles while clicking on `BUY` button
- Wait for the confirmation, then the offer is updated on the market (depending how many bottle you bought)
- Click on `bottle offers` sub menu
- You are now the owner of some bottles, you can resell a part of it at your own price, etc ...

For adding more collections, go to the Mint page and repeat the process

# :palm_tree: Conclusion :sun_with_face:

You are able to play with an any NFT template from the ligo library.

Congratulations !

//TODO FA2.1 ???

//TODO pictures to include everywhere
